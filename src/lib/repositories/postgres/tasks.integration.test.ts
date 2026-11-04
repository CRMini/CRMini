import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { saoPauloDayRange } from "@/lib/task-date";
import type { ClientsRepository, TasksRepository } from "../contracts";

// Teste real contra PostgreSQL, executado somente quando a variável aponta para
// um banco descartável. Exemplo:
//   CRM_TEST_POSTGRES_URL=postgres://test:test@127.0.0.1:55432/crm_test \
//     npx vitest run src/lib/repositories/postgres/tasks.integration.test.ts
const testUrl = process.env.CRM_TEST_POSTGRES_URL;
const schemaFile = path.join(
  process.cwd(),
  "database",
  "postgresql",
  "init.sql",
);

describe.runIf(Boolean(testUrl))("tasks no PostgreSQL real", () => {
  let client: Client;
  let repo: TasksRepository;
  let clientsRepo: ClientsRepository;

  beforeAll(async () => {
    process.env.CRM_POSTGRES_URL = testUrl;
    client = new Client({ connectionString: testUrl });
    await client.connect();
    await client.query(fs.readFileSync(schemaFile, "utf8"));
    repo = (await import("./tasks")).postgresTasksRepository;
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
    contactName = "Contato de Tarefas",
  ): Promise<{ clientId: string; contactId: string }> {
    const created = await clientsRepo.createClient({
      company_name: companyName,
      contacts: [{ full_name: contactName, is_primary: true }],
    });
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM contacts WHERE client_id = $1",
      [created.id],
    );
    return { clientId: created.id, contactId: rows[0].id };
  }

  const baseTask = (clientId: string, contactId: string) => ({
    contact_type: "email",
    subject: "  Retornar proposta  ",
    description: null,
    scheduled_at: "2026-10-12T09:00:00-03:00",
    client_id: clientId,
    contact_id: contactId,
  });

  describe("createTask", () => {
    it("cria tarefa com assunto limpo e instante normalizado em UTC", async () => {
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      const created = await repo.createTask(baseTask(clientId, contactId));

      expect(created!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created!.subject).toBe("Retornar proposta");
      expect(created!.scheduled_at).toBe("2026-10-12T12:00:00.000Z");
      expect(created!.status).toBe("Aberto");
    });

    it("retorna null para cliente desativado", async () => {
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      await clientsRepo.deactivateClient(clientId);
      expect(await repo.createTask(baseTask(clientId, contactId))).toBeNull();
    });

    it("retorna null para contato de outro cliente", async () => {
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      const other = await createCompany(
        "Outra Empresa Ltda.",
        "Contato Alheio",
      );
      expect(
        await repo.createTask({
          ...baseTask(clientId, contactId),
          contact_id: other.contactId,
        }),
      ).toBeNull();
    });

    it("rejeita assunto vazio pela constraint do schema", async () => {
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      await expect(
        repo.createTask({ ...baseTask(clientId, contactId), subject: "   " }),
      ).rejects.toThrow(/subject/);
    });
  });

  describe("listTasks", () => {
    beforeEach(async () => {
      // Limites do dia civil 2026-10-12 em São Paulo: 03:00Z até 03:00Z do dia seguinte.
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      await repo.createTask({
        ...baseTask(clientId, contactId),
        subject: "Antes do dia",
        scheduled_at: "2026-10-12T02:59:59.000Z",
      });
      await repo.createTask({
        ...baseTask(clientId, contactId),
        subject: "No início do dia",
        scheduled_at: "2026-10-12T03:00:00.000Z",
      });
      await repo.createTask({
        ...baseTask(clientId, contactId),
        subject: "No fim do dia",
        scheduled_at: "2026-10-13T02:59:59.000Z",
      });
      await repo.createTask({
        ...baseTask(clientId, contactId),
        subject: "No dia seguinte",
        scheduled_at: "2026-10-13T03:00:00.000Z",
      });
    });

    it("filtra pelo dia civil de São Paulo sem deslocar instantes", async () => {
      const { start, end } = saoPauloDayRange("2026-10-12");
      const tasks = await repo.listTasks(start, end, null);

      expect(tasks.map((task) => task.subject)).toEqual([
        "No início do dia",
        "No fim do dia",
      ]);
    });

    it("lista tudo sem filtro de data e aplica filtro de status", async () => {
      expect(await repo.listTasks(null, null, null)).toHaveLength(4);

      const { start, end } = saoPauloDayRange("2026-10-12");
      expect(await repo.listTasks(start, end, "Concluído")).toHaveLength(0);
    });

    it("retorna dados do cliente e do contato vinculados", async () => {
      const { start, end } = saoPauloDayRange("2026-10-12");
      const tasks = await repo.listTasks(start, end, null);

      expect(tasks[0]).toMatchObject({
        company_name: "Empresa de Tarefas Ltda.",
        contact_name: "Contato de Tarefas",
      });
    });
  });

  describe("updateTaskStatus", () => {
    it("alterna o status e retorna null para inexistente", async () => {
      const { clientId, contactId } = await createCompany(
        "Empresa de Tarefas Ltda.",
      );
      const created = await repo.createTask(baseTask(clientId, contactId));

      const updated = await repo.updateTaskStatus(created!.id, "Concluído");
      expect(updated).toEqual({ id: created!.id, status: "Concluído" });

      expect(
        await repo.updateTaskStatus(
          "00000000-0000-4000-8000-000000000000",
          "Aberto",
        ),
      ).toBeNull();
    });
  });
});
