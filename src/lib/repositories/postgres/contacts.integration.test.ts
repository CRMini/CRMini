import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ClientsRepository, ContactsRepository } from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/contacts.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("contacts no PostgreSQL real", () => {
  let client: Client;
  let repo: ContactsRepository;
  let clientsRepo: ClientsRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./contacts")).postgresContactsRepository;
    clientsRepo = (await import("./clients")).postgresClientsRepository;
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

  async function createCompany(
    companyName: string,
    options: {
      trade_name?: string;
      industry?: string;
      contacts?: Record<string, any>[];
    } = {},
  ): Promise<Record<string, any>> {
    return clientsRepo.createClient({
      company_name: companyName,
      trade_name: options.trade_name ?? null,
      industry: options.industry ?? null,
      contacts: options.contacts ?? [],
    });
  }

  async function contactId(fullName: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM contacts WHERE full_name = $1",
      [fullName],
    );
    return rows[0].id;
  }

  async function contactCount(): Promise<number> {
    const { rows } = await client.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM contacts",
    );
    return rows[0].n;
  }

  describe("createContact", () => {
    it("cria contato para cliente ativo com defaults nulos e is_primary inteiro", async () => {
      const company = await createCompany("Aurora Tecnologia Ltda.", {
        trade_name: "Aurora",
        industry: "Tecnologia da Informação",
      });

      const contact = await repo.createContact({
        client_id: company.id,
        full_name: "  Beatriz Lima  ",
        job_title: "CTO",
        email: "beatriz@example.com",
        phone: "+55 11 3000-1000",
        mobile: "+55 11 90000-1000",
        birthday: "1990-02-03",
        linkedin_url: "https://www.linkedin.com/in/beatriz-exemplo",
        notes: "Prefere contato por e-mail",
        is_primary: true,
      });

      expect(contact).toMatchObject({
        client_id: company.id,
        full_name: "Beatriz Lima",
        job_title: "CTO",
        email: "beatriz@example.com",
        phone: "+55 11 3000-1000",
        mobile: "+55 11 90000-1000",
        birthday: "1990-02-03",
        linkedin_url: "https://www.linkedin.com/in/beatriz-exemplo",
        notes: "Prefere contato por e-mail",
        is_primary: 1,
      });

      const empty = await repo.createContact({
        client_id: company.id,
        full_name: "Sem Extras",
        job_title: "",
        email: "",
        phone: "",
        mobile: "",
        birthday: "",
        linkedin_url: "",
        notes: "",
        is_primary: false,
      });
      expect(empty).toMatchObject({
        job_title: null,
        email: null,
        phone: null,
        mobile: null,
        birthday: null,
        linkedin_url: null,
        notes: null,
        is_primary: 0,
      });
    });

    it("não cria contato para cliente inativo", async () => {
      const company = await createCompany("Inativa Ltda.");
      await clientsRepo.deactivateClient(company.id);
      const before = await contactCount();

      await expect(
        repo.createContact({
          client_id: company.id,
          full_name: "Cliente Inativo",
        }),
      ).resolves.toBeUndefined();
      expect(await contactCount()).toBe(before);
    });

    it("não cria contato para cliente inexistente", async () => {
      const before = await contactCount();
      await expect(
        repo.createContact({ client_id: "missing", full_name: "Fantasma" }),
      ).resolves.toBeUndefined();
      expect(await contactCount()).toBe(before);
    });
  });

  describe("getContact", () => {
    it("retorna contato com dados da empresa e booleanos convertidos", async () => {
      const company = await createCompany("Aurora Tecnologia Ltda.", {
        trade_name: "Aurora",
        industry: "Tecnologia da Informação",
      });
      const created = (await repo.createContact({
        client_id: company.id,
        full_name: "Mariana Costa",
        job_title: "Diretora",
        email: "mariana@example.com",
        is_primary: true,
      })) as Record<string, any>;

      const contact = await repo.getContact(created!.id);
      expect(contact).toMatchObject({
        id: created!.id,
        full_name: "Mariana Costa",
        company_name: "Aurora Tecnologia Ltda.",
        trade_name: "Aurora",
        industry: "Tecnologia da Informação",
        is_primary: true,
        is_active: true,
      });
      expect(typeof contact!.is_primary).toBe("boolean");
      expect(typeof contact!.is_active).toBe("boolean");
    });

    it("retorna undefined para contato inexistente", async () => {
      await expect(
        repo.getContact("00000000-0000-4000-8000-000000000000"),
      ).resolves.toBeUndefined();
    });
  });

  describe("updateContact", () => {
    it("atualiza campos preservando cliente e retorna booleanos", async () => {
      const company = await createCompany("Aurora Tecnologia Ltda.");
      const created = (await repo.createContact({
        client_id: company.id,
        full_name: "Rafael Mendes",
      })) as Record<string, any>;

      const updated = await repo.updateContact(created!.id, {
        client_id: "outro-cliente",
        full_name: "  Rafael Mendes Silva  ",
        job_title: "Head de Engenharia",
        email: "rafael.silva@example.com",
        is_primary: true,
      });

      expect(updated).toMatchObject({
        id: created!.id,
        client_id: company.id,
        full_name: "Rafael Mendes Silva",
        job_title: "Head de Engenharia",
        email: "rafael.silva@example.com",
        is_primary: true,
      });
      expect(updated!.updated_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("retorna undefined para contato inexistente", async () => {
      await expect(
        repo.updateContact("00000000-0000-4000-8000-000000000000", {
          full_name: "Fantasma",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("soft delete de contatos", () => {
    it("desativa e reativa de forma idempotente; sinaliza inexistente", async () => {
      const company = await createCompany("Aurora Tecnologia Ltda.");
      const created = (await repo.createContact({
        client_id: company.id,
        full_name: "Contato Ativo",
      })) as Record<string, any>;

      await expect(repo.deactivateContact(created!.id)).resolves.toBe(true);
      await expect(repo.deactivateContact(created!.id)).resolves.toBe(true);
      expect(await repo.getContact(created!.id)).toMatchObject({
        is_active: false,
      });

      await expect(repo.reactivateContact(created!.id)).resolves.toBe(true);
      await expect(repo.reactivateContact(created!.id)).resolves.toBe(true);
      expect(await repo.getContact(created!.id)).toMatchObject({
        is_active: true,
      });

      await expect(
        repo.deactivateContact("00000000-0000-4000-8000-000000000000"),
      ).resolves.toBe(false);
      await expect(
        repo.reactivateContact("00000000-0000-4000-8000-000000000000"),
      ).resolves.toBe(false);
    });
  });

  describe("listContacts", () => {
    beforeEach(async () => {
      await createCompany("Aurora Tecnologia Ltda.", {
        trade_name: "Aurora",
        industry: "Tecnologia da Informação",
        contacts: [
          {
            full_name: "Mariana Costa",
            email: "mariana@example.com",
            is_primary: true,
          },
        ],
      });
      await createCompany("Verde Vivo S.A.", {
        industry: "Varejo e produtos naturais",
        contacts: [{ full_name: "Camila Oliveira", is_primary: true }],
      });
    });

    it("ordena por empresa com contato principal primeiro", async () => {
      const contacts = await repo.listContacts(null, null);
      expect(contacts.map((contact) => contact.full_name)).toEqual([
        "Mariana Costa",
        "Camila Oliveira",
      ]);
    });

    it("busca ignorando acentos e caixa", async () => {
      await createCompany("São Paulo Serviços", {
        contacts: [{ full_name: "José Silva" }],
      });
      expect(
        (await repo.listContacts("JOSÉ", null)).map((c) => c.full_name),
      ).toContain("José Silva");
      expect(
        (await repo.listContacts("sao paulo", null)).map((c) => c.full_name),
      ).toContain("José Silva");
    });

    it("busca contatos pelos dígitos do telefone formatado", async () => {
      const company = await createCompany("Telefonia Ltda.");
      await repo.createContact({
        client_id: company.id,
        full_name: "Contato Telefone",
        phone: "(11) 91234-5678",
      });

      for (const query of ["1191234", "91234", "912345678"]) {
        const contacts = await repo.listContacts(query, null);
        expect(contacts.map((contact) => contact.full_name)).toEqual([
          "Contato Telefone",
        ]);
      }
      expect(await repo.listContacts("xyz", null)).toEqual([]);
    });

    it("filtra por segmento da empresa", async () => {
      const contacts = await repo.listContacts(
        null,
        "Varejo e produtos naturais",
      );
      expect(contacts.map((contact) => contact.full_name)).toEqual([
        "Camila Oliveira",
      ]);
    });

    it("inclui inativos somente quando solicitado", async () => {
      const id = await contactId("Mariana Costa");
      await repo.deactivateContact(id);

      const active = await repo.listContacts(null, null);
      expect(active.map((contact) => contact.full_name)).not.toContain(
        "Mariana Costa",
      );

      const all = await repo.listContacts(null, null, true);
      const inactive = all.find(
        (contact) => contact.full_name === "Mariana Costa",
      )!;
      expect(inactive.is_active).toBe(false);
    });
  });

  describe("planContactImport", () => {
    it("retorna lista vazia para lote vazio", async () => {
      await expect(repo.planContactImport([])).resolves.toEqual([]);
    });

    it("cobre todos os status, incluindo duplicata no lote", async () => {
      const comContato = await createCompany("Com Contato", {
        contacts: [
          {
            full_name: "Ana Souza",
            linkedin_url: "https://www.linkedin.com/in/ana",
          },
        ],
      });
      const destino = await createCompany("Destino");
      const inativa = await createCompany("Inativa");
      await clientsRepo.deactivateClient(inativa.id);
      const existingId = await contactId("Ana Souza");

      const outcomes = await repo.planContactImport([
        { rowId: 1, clientId: destino.id, fullName: "" },
        { rowId: 2, clientId: "missing", fullName: "Fantasma" },
        { rowId: 3, clientId: inativa.id, fullName: "Inativa" },
        {
          rowId: 4,
          clientId: destino.id,
          fullName: "Ana Souza",
          linkedinUrl: "https://www.linkedin.com/in/ana/",
        },
        {
          rowId: 5,
          clientId: destino.id,
          fullName: "Dup A",
          linkedinUrl: "https://www.linkedin.com/in/dup",
        },
        {
          rowId: 6,
          clientId: destino.id,
          fullName: "Dup B",
          linkedinUrl: "https://www.linkedin.com/in/dup",
        },
        { rowId: 7, clientId: comContato.id, fullName: "Válido" },
      ]);

      expect(outcomes).toEqual([
        { rowId: 1, status: "invalid_name" },
        { rowId: 2, status: "invalid_client" },
        { rowId: 3, status: "invalid_client" },
        { rowId: 4, status: "duplicate", existingContactId: existingId },
        { rowId: 5, status: "would_import" },
        { rowId: 6, status: "duplicate_in_batch" },
        { rowId: 7, status: "would_import" },
      ]);
    });

    it("detecta duplicata por e-mail no mesmo cliente", async () => {
      const origem = await createCompany("Origem", {
        contacts: [{ full_name: "Maria", email: "maria@example.com" }],
      });

      const outcomes = await repo.planContactImport([
        {
          rowId: 1,
          clientId: origem.id,
          fullName: "Maria Silva",
          email: "MARIA@example.com",
        },
      ]);

      expect(outcomes).toEqual([
        {
          rowId: 1,
          status: "duplicate",
          existingContactId: await contactId("Maria"),
        },
      ]);
    });

    it("não escreve no banco", async () => {
      const empresa = await createCompany("Somente Leitura");
      const before = await contactCount();

      const outcomes = await repo.planContactImport([
        { rowId: 1, clientId: empresa.id, fullName: "Não Persistido" },
      ]);

      expect(outcomes).toEqual([{ rowId: 1, status: "would_import" }]);
      expect(await contactCount()).toBe(before);
    });
  });

  describe("createContactsBatch", () => {
    it("grava somente would_import e retorna imported com contactId", async () => {
      const a = await createCompany("A");
      const b = await createCompany("B");

      const outcomes = await repo.createContactsBatch([
        {
          rowId: 10,
          clientId: a.id,
          fullName: "Ana",
          email: "ana@example.com",
        },
        { rowId: 20, clientId: b.id, fullName: "Bia" },
      ]);

      expect(
        outcomes.map((o) => ({ rowId: o.rowId, status: o.status })),
      ).toEqual([
        { rowId: 10, status: "imported" },
        { rowId: 20, status: "imported" },
      ]);
      expect(outcomes[0].contactId).toMatch(/^[0-9a-f-]{36}$/);
      expect(outcomes[1].contactId).toMatch(/^[0-9a-f-]{36}$/);

      const { rows } = await client.query<{
        full_name: string;
        email: string | null;
        is_primary: number;
      }>(
        "SELECT full_name, email, is_primary FROM contacts ORDER BY full_name",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        full_name: "Ana",
        email: "ana@example.com",
        is_primary: 0,
      });
    });

    it("não insere itens classificados como ignorados", async () => {
      const a = await createCompany("A");

      const outcomes = await repo.createContactsBatch([
        { rowId: 1, clientId: a.id, fullName: "  " },
        { rowId: 2, clientId: "missing", fullName: "Fantasma" },
        { rowId: 3, clientId: a.id, fullName: "Válido" },
      ]);

      expect(
        outcomes.map((o) => ({ rowId: o.rowId, status: o.status })),
      ).toEqual([
        { rowId: 1, status: "invalid_name" },
        { rowId: 2, status: "invalid_client" },
        { rowId: 3, status: "imported" },
      ]);
      expect(await contactCount()).toBe(1);
    });

    it("faz rollback total quando um item falha", async () => {
      const a = await createCompany("Alpha S.A.");
      const b = await createCompany("Beta S.A.");

      // Objeto circular não é serializável: o driver falha ao preparar o
      // parâmetro job_title, dentro da transação, forçando o rollback.
      const circular: any = {};
      circular.self = circular;

      await expect(
        repo.createContactsBatch([
          { rowId: 1, clientId: a.id, fullName: "Primeiro" },
          { rowId: 2, clientId: b.id, fullName: "Segundo", jobTitle: circular },
        ]),
      ).rejects.toThrow();

      expect(await contactCount()).toBe(0);
    });
  });
});
