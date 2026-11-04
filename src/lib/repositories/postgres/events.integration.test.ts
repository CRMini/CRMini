import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getBrazilDateString } from "@/lib/brazil-date";
import type {
  ClientsRepository,
  EventsRepository,
  OpportunitiesRepository,
} from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/events.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("events no PostgreSQL real", () => {
  let client: Client;
  let repo: EventsRepository;
  let clientsRepo: ClientsRepository;
  let opportunitiesRepo: OpportunitiesRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./events")).postgresEventsRepository;
    clientsRepo = (await import("./clients")).postgresClientsRepository;
    opportunitiesRepo = (await import("./opportunities"))
      .postgresOpportunitiesRepository;
  });

  beforeEach(async () => {
    await client.query(
      "DELETE FROM events; DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
    );
  });

  afterAll(async () => {
    await client?.end();
    const globalForPostgres = globalThis as unknown as {
      crmPostgresPool?: { end(): Promise<void> };
    };
    await globalForPostgres.crmPostgresPool?.end();
    delete globalForPostgres.crmPostgresPool;
    delete process.env.CRM_POSTGRES_URL;
  });

  async function contactIdOf(clientId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM contacts WHERE client_id = $1",
      [clientId],
    );
    return rows[0].id;
  }

  let clientId: string;
  let contactId: string;
  let otherClientId: string;
  let otherContactId: string;
  let opportunityId: string;
  let otherOpportunityId: string;

  beforeEach(async () => {
    const created = await clientsRepo.createClient({
      company_name: "Empresa Histórico Ltda.",
      contacts: [{ full_name: "Contato Histórico", is_primary: true }],
    });
    clientId = created.id;
    contactId = await contactIdOf(clientId);

    const other = await clientsRepo.createClient({
      company_name: "Outra Empresa S.A.",
      contacts: [{ full_name: "Outro Contato" }],
    });
    otherClientId = other.id;
    otherContactId = await contactIdOf(otherClientId);

    const opportunity = (await opportunitiesRepo.createOpportunity({
      name: "Oportunidade do Histórico",
      client_id: clientId,
      contact_id: contactId,
    })) as Record<string, any>;
    opportunityId = opportunity.id;

    const otherOpportunity = (await opportunitiesRepo.createOpportunity({
      name: "Oportunidade Alheia",
      client_id: otherClientId,
      contact_id: otherContactId,
    })) as Record<string, any>;
    otherOpportunityId = otherOpportunity.id;
  });

  const baseEvent = () => ({
    client_id: clientId,
    contact_id: contactId,
    opportunity_id: opportunityId,
    event_type: "reuniao",
    title: "  Reunião inicial  ",
    details: "  ",
    occurred_at: "2026-10-01",
  });

  async function markOrigin(id: string): Promise<void> {
    await client.query("UPDATE events SET is_origin = 1 WHERE id = $1", [id]);
  }

  async function setCreatedAt(id: string, value: string): Promise<void> {
    await client.query("UPDATE events SET created_at = $1 WHERE id = $2", [
      value,
      id,
    ]);
  }

  describe("createEvent", () => {
    it("cria evento com título limpo, detalhes vazios como null e is_origin false", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.title).toBe("Reunião inicial");
      expect(created.details).toBeNull();
      expect(created.is_origin).toBe(false);
      expect(created.is_active).toBe(1);
      expect(created.occurred_at).toBe("2026-10-01");
    });

    it("usa a data civil de hoje e o tipo nota quando ausentes", async () => {
      const { occurred_at, event_type, ...rest } = baseEvent();
      const created = (await repo.createEvent(rest)) as Record<string, any>;

      expect(created.occurred_at).toBe(getBrazilDateString());
      expect(created.event_type).toBe("nota");
    });

    it("aceita cliente inativo porque o histórico é retrospectivo", async () => {
      await clientsRepo.deactivateClient(clientId);

      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;
      expect(created).not.toBeNull();
      expect(created.client_id).toBe(clientId);
    });

    it("retorna null para cliente, contato ou oportunidade inválidos", async () => {
      expect(
        await repo.createEvent({
          ...baseEvent(),
          client_id: "00000000-0000-4000-8000-000000000000",
        }),
      ).toBeNull();
      expect(
        await repo.createEvent({ ...baseEvent(), contact_id: otherContactId }),
      ).toBeNull();
      expect(
        await repo.createEvent({
          ...baseEvent(),
          opportunity_id: otherOpportunityId,
        }),
      ).toBeNull();
    });

    it("aceita evento apenas do cliente", async () => {
      const created = (await repo.createEvent({
        ...baseEvent(),
        opportunity_id: undefined,
        contact_id: undefined,
      })) as Record<string, any>;

      expect(created.opportunity_id).toBeNull();
      expect(created.contact_id).toBeNull();
    });

    it("impede excluir cliente com evento vinculado pela chave estrangeira", async () => {
      await repo.createEvent(baseEvent());

      await expect(
        client.query("DELETE FROM clients WHERE id = $1", [clientId]),
      ).rejects.toThrow(/foreign key|violates/i);
    });
  });

  describe("listEvents", () => {
    it("lista apenas eventos ativos do cliente com nomes e is_origin booleano", async () => {
      const older = (await repo.createEvent({
        ...baseEvent(),
        event_type: "nota",
        title: "Evento sem vínculos",
        opportunity_id: undefined,
        contact_id: undefined,
        occurred_at: "2026-09-01",
      })) as Record<string, any>;
      const linked = (await repo.createEvent({
        ...baseEvent(),
        title: "Evento vinculado",
        occurred_at: "2026-10-01",
      })) as Record<string, any>;
      const latest = (await repo.createEvent({
        ...baseEvent(),
        event_type: "email",
        title: "Evento mais recente",
        opportunity_id: undefined,
        contact_id: undefined,
        occurred_at: "2026-10-01",
      })) as Record<string, any>;

      await markOrigin(linked.id);
      await setCreatedAt(linked.id, "2026-10-05T00:00:00.000Z");
      await setCreatedAt(latest.id, "2026-10-06T00:00:00.000Z");
      await client.query("UPDATE events SET is_active = 0 WHERE id = $1", [
        older.id,
      ]);

      const events = (await repo.listEvents({ clientId })) as Record<
        string,
        any
      >[];

      expect(events.map((event) => event.id)).toEqual([latest.id, linked.id]);
      expect(events[1]).toMatchObject({
        company_name: "Empresa Histórico Ltda.",
        opportunity_name: "Oportunidade do Histórico",
        contact_name: "Contato Histórico",
        is_origin: true,
      });
      expect(events[0]).toMatchObject({
        opportunity_name: null,
        contact_name: null,
        is_origin: false,
      });
    });

    it("filtra por tipo, por oportunidade e aplica limite", async () => {
      await repo.createEvent({
        ...baseEvent(),
        event_type: "reuniao",
        occurred_at: "2026-10-03",
      });
      await repo.createEvent({
        ...baseEvent(),
        event_type: "email",
        opportunity_id: undefined,
        occurred_at: "2026-10-02",
      });
      await repo.createEvent({
        ...baseEvent(),
        event_type: "nota",
        opportunity_id: undefined,
        occurred_at: "2026-10-01",
      });

      const meetings = (await repo.listEvents({
        clientId,
        type: "reuniao",
      })) as Record<string, any>[];
      expect(meetings).toHaveLength(1);
      expect(meetings[0].event_type).toBe("reuniao");

      const byOpportunity = (await repo.listEvents({
        opportunityId,
      })) as Record<string, any>[];
      expect(byOpportunity).toHaveLength(1);
      expect(byOpportunity[0].opportunity_id).toBe(opportunityId);

      const limited = (await repo.listEvents({
        clientId,
        limit: 2,
      })) as Record<string, any>[];
      expect(limited).toHaveLength(2);
    });

    it("normaliza limite inválido ou ausente para o padrão", async () => {
      for (let index = 0; index < 3; index += 1) {
        await repo.createEvent({
          ...baseEvent(),
          opportunity_id: undefined,
          contact_id: undefined,
          occurred_at: `2026-10-0${index + 1}`,
        });
      }

      const defaulted = (await repo.listEvents({
        clientId,
        limit: 0,
      })) as Record<string, any>[];
      expect(defaulted).toHaveLength(3);
    });

    it("não vaza eventos de outro cliente", async () => {
      await repo.createEvent(baseEvent());
      await repo.createEvent({
        ...baseEvent(),
        client_id: otherClientId,
        contact_id: otherContactId,
        opportunity_id: otherOpportunityId,
      });

      const events = (await repo.listEvents({ clientId })) as Record<
        string,
        any
      >[];
      expect(events).toHaveLength(1);
      expect(events[0].client_id).toBe(clientId);
    });
  });

  describe("getEvent", () => {
    it("retorna o evento com nomes resolvidos e is_origin booleano", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;
      await markOrigin(created.id);

      const event = (await repo.getEvent(created.id)) as Record<string, any>;

      expect(event).toMatchObject({
        id: created.id,
        company_name: "Empresa Histórico Ltda.",
        opportunity_name: "Oportunidade do Histórico",
        contact_name: "Contato Histórico",
        is_origin: true,
      });
      expect(
        await repo.getEvent("00000000-0000-4000-8000-000000000000"),
      ).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("atualiza conteúdo e normaliza detalhes vazios", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;

      const updated = await repo.updateEvent(created.id, {
        ...baseEvent(),
        event_type: "email",
        title: "  Retorno do cliente  ",
        details: "  ",
        occurred_at: "2026-10-02",
        contact_id: null,
        opportunity_id: null,
      });

      expect(updated).toMatchObject({
        id: created.id,
        event_type: "email",
        title: "Retorno do cliente",
        details: null,
        occurred_at: "2026-10-02",
        contact_id: null,
        opportunity_id: null,
      });
    });

    it("rejeita contato ou oportunidade de outro cliente", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;

      expect(
        await repo.updateEvent(created.id, {
          ...baseEvent(),
          contact_id: otherContactId,
        }),
      ).toBeNull();
      expect(
        await repo.updateEvent(created.id, {
          ...baseEvent(),
          opportunity_id: otherOpportunityId,
        }),
      ).toBeNull();
    });

    it("não atualiza evento inativo", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;
      await repo.deactivateEvent(created.id);

      expect(
        await repo.updateEvent(created.id, { ...baseEvent(), title: "Depois" }),
      ).toBeNull();
    });

    it("mantém a oportunidade do evento de origem", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;
      await markOrigin(created.id);

      expect(
        await repo.updateEvent(created.id, {
          ...baseEvent(),
          opportunity_id: null,
        }),
      ).toBeNull();

      expect(
        await repo.updateEvent(created.id, {
          ...baseEvent(),
          title: "Origem revisada",
        }),
      ).toMatchObject({ title: "Origem revisada", is_origin: true });
    });
  });

  describe("deactivateEvent", () => {
    it("faz exclusão lógica e remove o evento da listagem", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;

      expect(await repo.deactivateEvent(created.id)).not.toBeNull();

      expect(
        (await repo.listEvents({ clientId })).some(
          (event) => event.id === created.id,
        ),
      ).toBe(false);
      expect((await repo.getEvent(created.id))?.is_active).toBe(0);
    });

    it("não desativa evento de origem", async () => {
      const created = (await repo.createEvent(baseEvent())) as Record<
        string,
        any
      >;
      await markOrigin(created.id);

      expect(await repo.deactivateEvent(created.id)).toBeNull();
      expect((await repo.getEvent(created.id))?.is_active).toBe(1);
    });
  });
});
