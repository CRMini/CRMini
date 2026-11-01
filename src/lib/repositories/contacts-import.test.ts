import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import { createClient, deactivateClient } from "./clients";
import { createContactsBatch, planContactImport } from "./contacts";

function cleanTables() {
  getDb().exec(
    "DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

function contactId(fullName: string) {
  return (
    getDb().prepare("SELECT id FROM contacts WHERE full_name = ?").get(fullName) as {
      id: string;
    }
  ).id;
}

beforeEach(cleanTables);

describe("planContactImport", () => {
  it("retorna lista vazia para lote vazio", async () => {
    await expect(planContactImport([])).resolves.toEqual([]);
  });

  it("aceita múltiplos clientes preservando ordem e rowId", async () => {
    const a = await createClient({ company_name: "Empresa A", contacts: [] });
    const b = await createClient({ company_name: "Empresa B", contacts: [] });

    const outcomes = await planContactImport([
      { rowId: 10, clientId: a.id, fullName: "Primeiro" },
      { rowId: 20, clientId: b.id, fullName: "Segundo" },
      { rowId: 30, clientId: a.id, fullName: "Terceiro" },
    ]);

    expect(outcomes).toEqual([
      { rowId: 10, status: "would_import" },
      { rowId: 20, status: "would_import" },
      { rowId: 30, status: "would_import" },
    ]);
  });

  it("marca invalid_client para cliente inexistente ou inativo", async () => {
    const inactive = await createClient({ company_name: "Inativa", contacts: [] });
    await deactivateClient(inactive.id);

    const outcomes = await planContactImport([
      { rowId: 1, clientId: "missing-client", fullName: "Fantasma" },
      { rowId: 2, clientId: inactive.id, fullName: "Inativa" },
    ]);

    expect(outcomes).toEqual([
      { rowId: 1, status: "invalid_client" },
      { rowId: 2, status: "invalid_client" },
    ]);
  });

  it("marca invalid_name para nome vazio, só espaços ou acima de 200", async () => {
    const a = await createClient({ company_name: "Ativa", contacts: [] });
    const longName = "x".repeat(201);

    const outcomes = await planContactImport([
      { rowId: 1, clientId: a.id, fullName: "" },
      { rowId: 2, clientId: a.id, fullName: "   " },
      { rowId: 3, clientId: a.id, fullName: longName },
    ]);

    expect(outcomes).toEqual([
      { rowId: 1, status: "invalid_name" },
      { rowId: 2, status: "invalid_name" },
      { rowId: 3, status: "invalid_name" },
    ]);
  });

  it("detecta duplicata por URL global normalizada", async () => {
    await createClient({
      company_name: "Com Contato",
      contacts: [
        { full_name: "Ana Souza", linkedin_url: "https://www.linkedin.com/in/ana" },
      ],
    });
    const target = await createClient({ company_name: "Destino", contacts: [] });
    const existing = contactId("Ana Souza");

    const outcomes = await planContactImport([
      {
        rowId: 1,
        clientId: target.id,
        fullName: "Ana Souza",
        linkedinUrl: "https://www.linkedin.com/in/ana/",
      },
    ]);

    expect(outcomes).toEqual([
      { rowId: 1, status: "duplicate", existingContactId: existing },
    ]);
  });

  it("detecta duplicata por e-mail no mesmo cliente", async () => {
    const origin = await createClient({
      company_name: "Origem",
      contacts: [{ full_name: "Maria", email: "maria@example.com" }],
    });

    const outcomes = await planContactImport([
      {
        rowId: 1,
        clientId: origin.id,
        fullName: "Maria Silva",
        email: "MARIA@example.com",
      },
    ]);

    expect(outcomes).toEqual([
      {
        rowId: 1,
        status: "duplicate",
        existingContactId: contactId("Maria"),
      },
    ]);
  });

  it("não considera duplicata o mesmo e-mail em cliente diferente", async () => {
    await createClient({
      company_name: "Origem",
      contacts: [{ full_name: "Maria", email: "maria@example.com" }],
    });
    const other = await createClient({ company_name: "Destino", contacts: [] });

    const outcomes = await planContactImport([
      { rowId: 1, clientId: other.id, fullName: "Maria Souza", email: "maria@example.com" },
    ]);

    expect(outcomes).toEqual([{ rowId: 1, status: "would_import" }]);
  });

  it("marca duplicate_in_batch para URL repetida no próprio lote", async () => {
    const a = await createClient({ company_name: "Ativa", contacts: [] });

    const outcomes = await planContactImport([
      { rowId: 1, clientId: a.id, fullName: "Primeiro", linkedinUrl: "https://www.linkedin.com/in/dup" },
      { rowId: 2, clientId: a.id, fullName: "Segundo", linkedinUrl: "https://www.linkedin.com/in/dup" },
    ]);

    expect(outcomes).toEqual([
      { rowId: 1, status: "would_import" },
      { rowId: 2, status: "duplicate_in_batch" },
    ]);
  });

  it("marca duplicate_in_batch para e-mail repetido no mesmo cliente do lote", async () => {
    const a = await createClient({ company_name: "Ativa", contacts: [] });

    const outcomes = await planContactImport([
      { rowId: 1, clientId: a.id, fullName: "Primeiro", email: "dup@example.com" },
      { rowId: 2, clientId: a.id, fullName: "Segundo", email: "dup@example.com" },
    ]);

    expect(outcomes).toEqual([
      { rowId: 1, status: "would_import" },
      { rowId: 2, status: "duplicate_in_batch" },
    ]);
  });

  it("não escreve no banco", async () => {
    const a = await createClient({ company_name: "Somente Leitura", contacts: [] });
    const before = (
      getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number }
    ).n;

    const outcomes = await planContactImport([
      { rowId: 1, clientId: a.id, fullName: "Não Persistido" },
    ]);

    expect(outcomes).toEqual([{ rowId: 1, status: "would_import" }]);
    expect(
      (getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number })
        .n,
    ).toBe(before);
  });
});

describe("createContactsBatch", () => {
  it("grava somente would_import e retorna imported com contactId", async () => {
    const a = await createClient({ company_name: "A", contacts: [] });
    const b = await createClient({ company_name: "B", contacts: [] });

    const outcomes = await createContactsBatch([
      { rowId: 10, clientId: a.id, fullName: "Ana", email: "ana@example.com" },
      { rowId: 20, clientId: b.id, fullName: "Bia" },
    ]);

    expect(outcomes.map((o) => ({ rowId: o.rowId, status: o.status }))).toEqual([
      { rowId: 10, status: "imported" },
      { rowId: 20, status: "imported" },
    ]);
    expect(outcomes[0].contactId).toMatch(/^[0-9a-f-]{36}$/);
    expect(outcomes[1].contactId).toMatch(/^[0-9a-f-]{36}$/);

    const stored = getDb()
      .prepare(
        "SELECT client_id, full_name, email, is_primary FROM contacts ORDER BY full_name",
      )
      .all() as Array<{ client_id: string; full_name: string; email: string | null; is_primary: number }>;
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      client_id: a.id,
      full_name: "Ana",
      email: "ana@example.com",
      is_primary: 0,
    });
  });

  it("grava opcionais vazios como NULL, is_primary 0 e notes NULL", async () => {
    const a = await createClient({ company_name: "A", contacts: [] });

    await createContactsBatch([
      { rowId: 1, clientId: a.id, fullName: "Sem Extras" },
    ]);

    const row = getDb()
      .prepare(
        "SELECT is_primary, email, job_title, linkedin_url, notes FROM contacts WHERE full_name = 'Sem Extras'",
      )
      .get() as {
      is_primary: number;
      email: string | null;
      job_title: string | null;
      linkedin_url: string | null;
      notes: string | null;
    };
    expect(row).toEqual({
      is_primary: 0,
      email: null,
      job_title: null,
      linkedin_url: null,
      notes: null,
    });
  });

  it("não insere itens já classificados como ignorados", async () => {
    const a = await createClient({ company_name: "A", contacts: [] });

    const outcomes = await createContactsBatch([
      { rowId: 1, clientId: a.id, fullName: "  " },
      { rowId: 2, clientId: "missing", fullName: "Fantasma" },
      { rowId: 3, clientId: a.id, fullName: "Válido" },
    ]);

    expect(outcomes.map((o) => ({ rowId: o.rowId, status: o.status }))).toEqual([
      { rowId: 1, status: "invalid_name" },
      { rowId: 2, status: "invalid_client" },
      { rowId: 3, status: "imported" },
    ]);
    expect(
      (getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number })
        .n,
    ).toBe(1);
  });

  it("retorna lista vazia para lote vazio", async () => {
    await expect(createContactsBatch([])).resolves.toEqual([]);
  });

  it("marca invalid_client quando o INSERT não retorna linha", async () => {
    const a = await createClient({ company_name: "A", contacts: [] });
    const db = getDb();
    const realPrepare = db.prepare.bind(db);
    const spy = vi.spyOn(db, "prepare").mockImplementation(((sql: string) => {
      if (sql.includes("INSERT INTO contacts")) {
        return { get: () => undefined } as unknown as ReturnType<typeof realPrepare>;
      }
      return realPrepare(sql);
    }) as unknown as typeof db.prepare);

    const outcomes = await createContactsBatch([
      { rowId: 1, clientId: a.id, fullName: "Não Inserido" },
    ]);

    spy.mockRestore();
    expect(outcomes).toEqual([{ rowId: 1, status: "invalid_client" }]);
  });

  it("propaga erro do banco e faz rollback total", async () => {
    const a = await createClient({ company_name: "Alpha S.A.", contacts: [] });
    const b = await createClient({ company_name: "Beta S.A.", contacts: [] });

    await expect(
      createContactsBatch([
        { rowId: 1, clientId: a.id, fullName: "Primeiro" },
        // Provoca falha de binding no segundo INSERT, forçando rollback.
        { rowId: 2, clientId: b.id, fullName: "Segundo", jobTitle: { ruim: true } as unknown as string },
      ]),
    ).rejects.toThrow();

    expect(
      (
        getDb()
          .prepare("SELECT COUNT(*) AS n FROM contacts WHERE full_name = 'Primeiro'")
          .get() as { n: number }
      ).n,
    ).toBe(0);
  });
});
