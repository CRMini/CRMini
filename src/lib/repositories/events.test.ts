import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getBrazilDateString } from "@/lib/brazil-date";
import { getDb } from "@/lib/db";
import { createClient, deactivateClient } from "./clients";
import {
  createEvent,
  deactivateEvent,
  getEvent,
  listEvents,
  updateEvent,
} from "./events";
import { createOpportunity } from "./opportunities";

function cleanTables() {
  getDb().exec(
    "DELETE FROM events; DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

let clientId: string;
let contactId: string;
let otherClientId: string;
let otherContactId: string;
let opportunityId: string;
let otherOpportunityId: string;

async function contactOf(id: string) {
  return (
    getDb()
      .prepare("SELECT id FROM contacts WHERE client_id = ?")
      .get(id) as { id: string }
  ).id;
}

beforeEach(async () => {
  cleanTables();
  const client = await createClient({
    company_name: "Empresa Histórico Ltda.",
    contacts: [{ full_name: "Contato Histórico", is_primary: true }],
  });
  clientId = client.id;
  contactId = await contactOf(clientId);

  const other = await createClient({
    company_name: "Outra Empresa S.A.",
    contacts: [{ full_name: "Outro Contato" }],
  });
  otherClientId = other.id;
  otherContactId = await contactOf(otherClientId);

  const opportunity = (await createOpportunity({
    name: "Oportunidade do Histórico",
    client_id: clientId,
    contact_id: contactId,
  })) as Record<string, any>;
  opportunityId = opportunity.id;

  const otherOpportunity = (await createOpportunity({
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

describe("createEvent", () => {
  it("cria evento com título limpo, detalhes vazios como null e is_origin false", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, unknown>;

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.title).toBe("Reunião inicial");
    expect(created.details).toBeNull();
    expect(created.is_origin).toBe(false);
    expect(created.is_active).toBe(1);
    expect(created.occurred_at).toBe("2026-10-01");
  });

  it("usa a data civil de hoje e o tipo nota quando ausentes", async () => {
    const { occurred_at, event_type, ...rest } = baseEvent();
    const created = (await createEvent(rest)) as Record<string, unknown>;

    expect(created.occurred_at).toBe(getBrazilDateString());
    expect(created.event_type).toBe("nota");
  });

  it("aceita cliente inativo porque o histórico é retrospectivo", async () => {
    await deactivateClient(clientId);

    const created = (await createEvent(baseEvent())) as Record<string, unknown>;
    expect(created).not.toBeNull();
    expect(created.client_id).toBe(clientId);
  });

  it("retorna null para cliente, contato ou oportunidade inválidos", async () => {
    expect(
      await createEvent({
        ...baseEvent(),
        client_id: "00000000-0000-4000-8000-000000000000",
      }),
    ).toBeNull();
    expect(
      await createEvent({ ...baseEvent(), contact_id: otherContactId }),
    ).toBeNull();
    expect(
      await createEvent({ ...baseEvent(), opportunity_id: otherOpportunityId }),
    ).toBeNull();
  });

  it("aceita evento apenas do cliente", async () => {
    const created = (await createEvent({
      ...baseEvent(),
      opportunity_id: undefined,
      contact_id: undefined,
    })) as Record<string, unknown>;

    expect(created.opportunity_id).toBeNull();
    expect(created.contact_id).toBeNull();
  });

  it("impede excluir cliente com evento vinculado", async () => {
    await createEvent(baseEvent());

    expect(() =>
      getDb().prepare("DELETE FROM clients WHERE id = ?").run(clientId),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("listEvents", () => {
  it("lista apenas eventos ativos do cliente com nomes e is_origin booleano", async () => {
    const older = (await createEvent({
      ...baseEvent(),
      event_type: "nota",
      title: "Evento sem vínculos",
      opportunity_id: undefined,
      contact_id: undefined,
      occurred_at: "2026-09-01",
    })) as Record<string, unknown>;
    const linked = (await createEvent({
      ...baseEvent(),
      title: "Evento vinculado",
      occurred_at: "2026-10-01",
    })) as Record<string, unknown>;
    const latest = (await createEvent({
      ...baseEvent(),
      event_type: "email",
      title: "Evento mais recente",
      opportunity_id: undefined,
      contact_id: undefined,
      occurred_at: "2026-10-01",
    })) as Record<string, unknown>;

    getDb()
      .prepare("UPDATE events SET is_origin = 1 WHERE id = ?")
      .run(linked.id);
    getDb()
      .prepare("UPDATE events SET created_at = ? WHERE id = ?")
      .run("2026-10-05T00:00:00.000Z", linked.id);
    getDb()
      .prepare("UPDATE events SET created_at = ? WHERE id = ?")
      .run("2026-10-06T00:00:00.000Z", latest.id);
    getDb()
      .prepare("UPDATE events SET is_active = 0 WHERE id = ?")
      .run(older.id);

    const events = (await listEvents({ clientId })) as Record<string, any>[];

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
    await createEvent({
      ...baseEvent(),
      event_type: "reuniao",
      occurred_at: "2026-10-03",
    });
    await createEvent({
      ...baseEvent(),
      event_type: "email",
      opportunity_id: undefined,
      occurred_at: "2026-10-02",
    });
    await createEvent({
      ...baseEvent(),
      event_type: "nota",
      opportunity_id: undefined,
      occurred_at: "2026-10-01",
    });

    const meetings = (await listEvents({
      clientId,
      type: "reuniao",
    })) as Record<string, any>[];
    expect(meetings).toHaveLength(1);
    expect(meetings[0].event_type).toBe("reuniao");

    const byOpportunity = (await listEvents({
      opportunityId,
    })) as Record<string, any>[];
    expect(byOpportunity).toHaveLength(1);
    expect(byOpportunity[0].opportunity_id).toBe(opportunityId);

    const limited = (await listEvents({
      clientId,
      limit: 2,
    })) as Record<string, any>[];
    expect(limited).toHaveLength(2);
  });

  it("não vaza eventos de outro cliente", async () => {
    await createEvent(baseEvent());
    await createEvent({
      ...baseEvent(),
      client_id: otherClientId,
      contact_id: otherContactId,
      opportunity_id: otherOpportunityId,
    });

    const events = (await listEvents({ clientId })) as Record<string, any>[];
    expect(events).toHaveLength(1);
    expect(events[0].client_id).toBe(clientId);
  });
});

describe("getEvent", () => {
  it("retorna o evento com nomes resolvidos e is_origin booleano", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, unknown>;
    getDb()
      .prepare("UPDATE events SET is_origin = 1 WHERE id = ?")
      .run(created.id);

    const event = (await getEvent(created.id as string)) as Record<string, any>;

    expect(event).toMatchObject({
      id: created.id,
      company_name: "Empresa Histórico Ltda.",
      opportunity_name: "Oportunidade do Histórico",
      contact_name: "Contato Histórico",
      is_origin: true,
    });
    expect(await getEvent("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("updateEvent", () => {
  it("atualiza conteúdo e normaliza detalhes vazios", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, any>;

    const updated = await updateEvent(created.id, {
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
    const created = (await createEvent(baseEvent())) as Record<string, any>;

    expect(
      await updateEvent(created.id, {
        ...baseEvent(),
        contact_id: otherContactId,
      }),
    ).toBeNull();
    expect(
      await updateEvent(created.id, {
        ...baseEvent(),
        opportunity_id: otherOpportunityId,
      }),
    ).toBeNull();
  });

  it("não atualiza evento inativo", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, any>;
    await deactivateEvent(created.id);

    expect(
      await updateEvent(created.id, { ...baseEvent(), title: "Depois" }),
    ).toBeNull();
  });

  it("mantém a oportunidade do evento de origem", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, any>;
    getDb()
      .prepare("UPDATE events SET is_origin = 1 WHERE id = ?")
      .run(created.id);

    expect(
      await updateEvent(created.id, {
        ...baseEvent(),
        opportunity_id: null,
      }),
    ).toBeNull();

    expect(
      await updateEvent(created.id, {
        ...baseEvent(),
        title: "Origem revisada",
      }),
    ).toMatchObject({ title: "Origem revisada", is_origin: true });
  });
});

describe("deactivateEvent", () => {
  it("faz exclusão lógica e remove o evento da listagem", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, any>;

    expect(await deactivateEvent(created.id)).not.toBeNull();

    expect(
      (await listEvents({ clientId })).some((event) => event.id === created.id),
    ).toBe(false);
    expect((await getEvent(created.id))?.is_active).toBe(0);
  });

  it("não desativa evento de origem", async () => {
    const created = (await createEvent(baseEvent())) as Record<string, any>;
    getDb()
      .prepare("UPDATE events SET is_origin = 1 WHERE id = ?")
      .run(created.id);

    expect(await deactivateEvent(created.id)).toBeNull();
    expect((await getEvent(created.id))?.is_active).toBe(1);
  });
});
