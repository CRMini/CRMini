import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ClientsRepository } from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/clients.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

const baseClient = {
  company_name: "Empresa Exemplo Ltda.",
  trade_name: "Exemplo",
  industry: "Tecnologia da Informação",
  contacts: [
    {
      full_name: "Ana Souza",
      email: "ana@example.com",
      birthday: "1990-05-10",
      is_primary: true,
    },
    { full_name: "Bruno Lima", job_title: "Gerente" },
  ],
};

describe.runIf(Boolean(testUrl))("clients no PostgreSQL real", () => {
  let client: Client;
  let repo: ClientsRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./clients")).postgresClientsRepository;
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

  describe("createClient", () => {
    it("cria cliente com contatos e sem contatos", async () => {
      const withContacts = await repo.createClient(baseClient);
      expect(withContacts.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(withContacts.is_active).toBe(true);
      expect(withContacts.country).toBe("Brasil");

      const { client: stored, found } = await repo.getClient(withContacts.id);
      expect(found).toBe(true);
      expect(stored!.company_name).toBe("Empresa Exemplo Ltda.");
      expect(stored!.contacts).toHaveLength(2);
      expect(stored!.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            full_name: "Ana Souza",
            birthday: "1990-05-10",
            is_primary: true,
          }),
          expect.objectContaining({
            full_name: "Bruno Lima",
            birthday: null,
            is_primary: false,
          }),
        ]),
      );

      const withoutContacts = await repo.createClient({
        company_name: "Outra Companhia",
        contacts: [],
      });
      const { client: empty } = await repo.getClient(withoutContacts.id);
      expect(empty!.contacts).toEqual([]);
    });

    it("ignora cartões de contato sem nome, como no SQLite", async () => {
      const created = await repo.createClient({
        company_name: "Sem Contato S.A.",
        contacts: [{ full_name: "   " }, { full_name: "Contato Válido" }],
      });

      const { client: stored } = await repo.getClient(created.id);
      expect(stored!.contacts).toHaveLength(1);
      expect(stored!.contacts[0]).toMatchObject({
        full_name: "Contato Válido",
      });
    });

    it("faz rollback completo quando um contato falha", async () => {
      // Objeto circular não é serializável: o driver falha durante a
      // preparação dos parâmetros, dentro da transação, forçando o rollback.
      const circular: any = { full_name: "Contato Inválido" };
      circular.email = circular;

      await expect(
        repo.createClient({
          company_name: "Rollback S.A.",
          contacts: [circular],
        }),
      ).rejects.toThrow();

      await expect(repo.listClients("Rollback")).resolves.toHaveLength(0);
      const { rows } = await client.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM contacts",
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe("listClients", () => {
    it("lista com contatos agregados e booleanos convertidos", async () => {
      await repo.createClient(baseClient);
      await repo.createClient({
        company_name: "Outra Companhia",
        contacts: [],
      });

      const clients = await repo.listClients(null);
      expect(clients).toHaveLength(2);

      const exemplo = clients.find(
        (row) => row.company_name === "Empresa Exemplo Ltda.",
      )!;
      expect(exemplo.is_active).toBe(true);
      expect(exemplo.contacts).toHaveLength(2);
      expect(
        exemplo.contacts.find((contact: any) => contact.is_primary)?.full_name,
      ).toBe("Ana Souza");

      const outra = clients.find(
        (row) => row.company_name === "Outra Companhia",
      )!;
      expect(outra.contacts).toEqual([]);
    });

    it("busca sem distinção de acentos ou caixa", async () => {
      await repo.createClient({
        company_name: "São Paulo Comércio",
        contacts: [{ full_name: "José Silva" }],
      });
      await repo.createClient({ company_name: "Acme Indústria" });

      await expect(repo.listClients("JOSÉ")).resolves.toHaveLength(1);
      await expect(repo.listClients("sao paulo")).resolves.toHaveLength(1);
      await expect(repo.listClients("josé")).resolves.toHaveLength(1);
      await expect(repo.listClients("acme")).resolves.toHaveLength(1);
      await expect(repo.listClients("inexistente")).resolves.toHaveLength(0);
    });
  });

  describe("getClient", () => {
    it("retorna found=false para cliente inexistente", async () => {
      const result = await repo.getClient(
        "00000000-0000-4000-8000-000000000000",
      );
      expect(result.found).toBe(false);
      expect(result.client).toBeUndefined();
    });
  });

  describe("updateClient", () => {
    it("atualiza dados da empresa preservando contatos existentes", async () => {
      const created = await repo.createClient(baseClient);
      const { client: stored } = await repo.getClient(created.id);
      const ana = stored!.contacts.find(
        (contact: any) => contact.full_name === "Ana Souza",
      );
      const bruno = stored!.contacts.find(
        (contact: any) => contact.full_name === "Bruno Lima",
      );

      const updated = await repo.updateClient(created.id, {
        company_name: "Empresa Atualizada Ltda.",
        contacts: [
          { ...ana, full_name: "Ana Souza Editada", is_primary: true },
          { full_name: "Carla Nova", email: "carla@example.com" },
        ],
      });

      expect(updated!.company_name).toBe("Empresa Atualizada Ltda.");

      const { client: after } = await repo.getClient(created.id);
      expect(after!.contacts).toHaveLength(2);

      const anaAfter = after!.contacts.find(
        (contact: any) => contact.id === ana.id,
      );
      expect(anaAfter).toMatchObject({
        full_name: "Ana Souza Editada",
        email: "ana@example.com",
        is_primary: true,
      });
      expect(
        after!.contacts.find(
          (contact: any) => contact.full_name === "Carla Nova",
        )?.id,
      ).not.toBe(ana.id);
      expect(after!.contacts.map((contact: any) => contact.id)).not.toContain(
        bruno.id,
      );

      // Contato removido do payload é desativado, não apagado.
      const raw = await client.query<{ is_active: number }>(
        "SELECT is_active FROM contacts WHERE id = $1",
        [bruno.id],
      );
      expect(raw.rows[0].is_active).toBe(0);
    });

    it("retorna null para cliente inexistente sem criar contatos", async () => {
      const result = await repo.updateClient(
        "00000000-0000-4000-8000-000000000000",
        { company_name: "Qualquer", contacts: [{ full_name: "Contato" }] },
      );
      expect(result).toBeNull();
      const { rows } = await client.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM contacts",
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe("deactivateClient", () => {
    it("desativa preservando o registro e sinaliza inexistentes", async () => {
      const created = await repo.createClient(baseClient);

      const result = await repo.deactivateClient(created.id);
      expect(result.found).toBe(true);

      const { client: stored } = await repo.getClient(created.id);
      expect(stored!.is_active).toBe(false);

      const missing = await repo.deactivateClient(
        "00000000-0000-4000-8000-000000000000",
      );
      expect(missing.found).toBe(false);
    });
  });

  describe("listClientOptions", () => {
    it("lista apenas ativos por padrão e inclui inativos quando solicitado", async () => {
      const active = await repo.createClient({ company_name: "Ativa Ltda." });
      const inactive = await repo.createClient({
        company_name: "Inativa Ltda.",
      });
      await repo.deactivateClient(inactive.id);

      const onlyActive = await repo.listClientOptions();
      expect(onlyActive).toEqual([
        {
          id: active.id,
          company_name: "Ativa Ltda.",
          trade_name: null,
          is_active: true,
        },
      ]);

      const all = await repo.listClientOptions(true);
      expect(all).toEqual([
        {
          id: active.id,
          company_name: "Ativa Ltda.",
          trade_name: null,
          is_active: true,
        },
        {
          id: inactive.id,
          company_name: "Inativa Ltda.",
          trade_name: null,
          is_active: false,
        },
      ]);
    });
  });
});
