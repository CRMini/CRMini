import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, txQuery } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  txQuery: vi.fn(),
}));

vi.mock("./connection", () => ({
  getPostgresPool: () => ({ query: poolQuery }),
  withPostgresTransaction: (
    callback: (client: { query: typeof txQuery }) => Promise<unknown>,
  ) => callback({ query: txQuery }),
}));

import {
  createContact,
  createContactsBatch,
  deactivateContact,
  getContact,
  listContacts,
  planContactImport,
  reactivateContact,
  updateContact,
} from "./contacts";

beforeEach(() => {
  poolQuery.mockReset();
  txQuery.mockReset();
});

describe("contacts (PostgreSQL) sem banco real", () => {
  describe("createContact", () => {
    it("insere contato com campos preenchidos e is_primary=1", async () => {
      poolQuery.mockResolvedValue({
        rows: [{ id: "p1", full_name: "Ana", is_primary: 1 }],
      });

      const result = await createContact({
        client_id: "c1",
        full_name: "  Ana  ",
        job_title: "CEO",
        email: "ana@example.com",
        phone: "11 3000-0000",
        mobile: "11 90000-0000",
        birthday: "1990-05-10",
        linkedin_url: "https://www.linkedin.com/in/ana",
        notes: "notas",
        is_primary: true,
      });

      expect(result).toEqual({ id: "p1", full_name: "Ana", is_primary: 1 });
      const params = poolQuery.mock.calls[0][1];
      expect(params[1]).toBe("Ana");
      expect(params[2]).toBe("CEO");
      expect(params[6]).toBe("1990-05-10");
      expect(params[9]).toBe(1);
      expect(params[10]).toBe("c1");
    });

    it("normaliza campos vazios para null e is_primary=0", async () => {
      poolQuery.mockResolvedValue({ rows: [{ id: "p2" }] });

      await createContact({
        client_id: "c1",
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

      const params = poolQuery.mock.calls[0][1];
      expect(params[2]).toBeNull();
      expect(params[3]).toBeNull();
      expect(params[4]).toBeNull();
      expect(params[5]).toBeNull();
      expect(params[6]).toBeNull();
      expect(params[7]).toBeNull();
      expect(params[8]).toBeNull();
      expect(params[9]).toBe(0);
    });

    it("retorna undefined quando o INSERT não produz linha", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      const result = await createContact({
        client_id: "c1",
        full_name: "Fantasma",
      });

      expect(result).toBeUndefined();
    });
  });

  describe("getContact", () => {
    it("retorna contato com booleanos convertidos", async () => {
      poolQuery.mockResolvedValue({
        rows: [
          {
            id: "p1",
            full_name: "Ana",
            company_name: "Acme",
            is_primary: 1,
            is_active: 0,
          },
        ],
      });

      const result = await getContact("p1");

      expect(result).toMatchObject({
        id: "p1",
        is_primary: true,
        is_active: false,
      });
    });

    it("retorna undefined para contato ausente", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      await expect(getContact("missing")).resolves.toBeUndefined();
    });
  });

  describe("deactivateContact / reactivateContact", () => {
    it("desativa conforme rowCount (1, 0 e ausente)", async () => {
      poolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      await expect(deactivateContact("c1")).resolves.toBe(true);
      expect(poolQuery.mock.calls[0][1]).toEqual([0, "c1"]);

      poolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      await expect(deactivateContact("c2")).resolves.toBe(false);

      poolQuery.mockResolvedValueOnce({ rows: [] });
      await expect(deactivateContact("c3")).resolves.toBe(false);
    });

    it("reativa usando is_active=1", async () => {
      poolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      await expect(reactivateContact("c1")).resolves.toBe(true);
      expect(poolQuery.mock.calls[0][1]).toEqual([1, "c1"]);
    });
  });

  describe("updateContact", () => {
    it("atualiza e retorna o contato", async () => {
      poolQuery
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "p1" }] })
        .mockResolvedValueOnce({
          rows: [
            { id: "p1", full_name: "Ana Silva", is_primary: 1, is_active: 1 },
          ],
        });

      const result = await updateContact("p1", {
        full_name: "  Ana Silva  ",
        job_title: "Diretora",
        email: "ana@example.com",
        is_primary: true,
      });

      expect(result).toMatchObject({
        id: "p1",
        is_primary: true,
        is_active: true,
      });
      const params = poolQuery.mock.calls[0][1];
      expect(params[0]).toBe("Ana Silva");
      expect(params[8]).toBe(1);
      expect(params[9]).toBe("p1");
    });

    it("normaliza campos vazios e is_primary=false", async () => {
      poolQuery
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "p2" }] })
        .mockResolvedValueOnce({
          rows: [
            { id: "p2", full_name: "Sem Extras", is_primary: 0, is_active: 1 },
          ],
        });

      await updateContact("p2", {
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

      const params = poolQuery.mock.calls[0][1];
      expect(params[1]).toBeNull();
      expect(params[5]).toBeNull();
      expect(params[8]).toBe(0);
    });

    it("retorna undefined quando rowCount === 0", async () => {
      poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(
        updateContact("missing", { full_name: "Fantasma" }),
      ).resolves.toBeUndefined();
      expect(poolQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("listContacts", () => {
    it("converte booleanos e repassa includeInactive/query/industry", async () => {
      poolQuery.mockResolvedValue({
        rows: [{ id: "p1", full_name: "Ana", is_primary: 1, is_active: 0 }],
      });

      const result = await listContacts("acme", "Tech", true);

      expect(poolQuery.mock.calls[0][1]).toEqual([1, "acme", "Tech"]);
      expect(result[0].is_primary).toBe(true);
      expect(result[0].is_active).toBe(false);
    });

    it("usa includeInactive=false e filtros nulos por padrão", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      await listContacts(null, null);

      expect(poolQuery.mock.calls[0][1]).toEqual([0, null, null]);
    });
  });

  describe("planContactImport", () => {
    it("retorna lista vazia para lote vazio sem consultar", async () => {
      await expect(planContactImport([])).resolves.toEqual([]);
      expect(poolQuery).not.toHaveBeenCalled();
    });

    it("cobre todos os status", async () => {
      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM contacts")) {
          return {
            rows: [
              {
                id: "c-ana",
                client_id: "cli1",
                linkedin_url: "https://www.linkedin.com/in/ana",
                email: null,
              },
              {
                id: "c-maria",
                client_id: "cli2",
                linkedin_url: null,
                email: "maria@example.com",
              },
            ],
          };
        }
        if (sql.includes("FROM clients")) {
          return { rows: [{ id: "cli1" }, { id: "cli2" }] };
        }
        return { rows: [] };
      });

      const longName = "X".repeat(201);

      const outcomes = await planContactImport([
        { rowId: 1, clientId: "cli1", fullName: "" },
        {
          rowId: 2,
          clientId: "cli1",
          fullName: undefined as unknown as string,
        },
        { rowId: 3, clientId: "cli1", fullName: longName },
        { rowId: 4, clientId: "", fullName: "Sem Cliente" },
        { rowId: 5, clientId: "missing", fullName: "Fantasma" },
        {
          rowId: 6,
          clientId: "cli1",
          fullName: "Ana Duplicada",
          linkedinUrl: "https://www.linkedin.com/in/ana",
        },
        {
          rowId: 7,
          clientId: "cli2",
          fullName: "Maria Duplicada",
          email: "MARIA@example.com",
        },
        {
          rowId: 8,
          clientId: "cli1",
          fullName: "Dup A",
          linkedinUrl: "https://www.linkedin.com/in/dup",
        },
        {
          rowId: 9,
          clientId: "cli1",
          fullName: "Dup B",
          linkedinUrl: "https://www.linkedin.com/in/dup",
        },
        {
          rowId: 10,
          clientId: "cli1",
          fullName: "Dup C",
          email: "novo@example.com",
        },
        {
          rowId: 11,
          clientId: "cli1",
          fullName: "Dup D",
          email: "NOVO@example.com",
        },
        { rowId: 12, clientId: "cli1", fullName: "Válido" },
      ]);

      expect(outcomes).toEqual([
        { rowId: 1, status: "invalid_name" },
        { rowId: 2, status: "invalid_name" },
        { rowId: 3, status: "invalid_name" },
        { rowId: 4, status: "invalid_client" },
        { rowId: 5, status: "invalid_client" },
        { rowId: 6, status: "duplicate", existingContactId: "c-ana" },
        { rowId: 7, status: "duplicate", existingContactId: "c-maria" },
        { rowId: 8, status: "would_import" },
        { rowId: 9, status: "duplicate_in_batch" },
        { rowId: 10, status: "would_import" },
        { rowId: 11, status: "duplicate_in_batch" },
        { rowId: 12, status: "would_import" },
      ]);
    });
  });

  describe("createContactsBatch", () => {
    it("grava somente would_import e repassa os demais status", async () => {
      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM contacts")) return { rows: [] };
        if (sql.includes("FROM clients")) return { rows: [{ id: "cli1" }] };
        return { rows: [] };
      });
      txQuery.mockResolvedValue({ rows: [{ id: "new-id" }] });

      const outcomes = await createContactsBatch([
        { rowId: 1, clientId: "cli1", fullName: "   " },
        { rowId: 2, clientId: "missing", fullName: "Fantasma" },
        { rowId: 3, clientId: "cli1", fullName: "Válido" },
      ]);

      expect(outcomes).toEqual([
        { rowId: 1, status: "invalid_name" },
        { rowId: 2, status: "invalid_client" },
        { rowId: 3, status: "imported", contactId: "new-id" },
      ]);
      expect(txQuery).toHaveBeenCalledTimes(1);
      expect(txQuery.mock.calls[0][0]).toContain("INSERT INTO contacts");
    });

    it("classifica como invalid_client quando o INSERT não produz linha", async () => {
      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM contacts")) return { rows: [] };
        if (sql.includes("FROM clients")) return { rows: [{ id: "cli1" }] };
        return { rows: [] };
      });
      txQuery.mockResolvedValue({ rows: [] });

      const outcomes = await createContactsBatch([
        { rowId: 1, clientId: "cli1", fullName: "Válido" },
      ]);

      expect(outcomes).toEqual([{ rowId: 1, status: "invalid_client" }]);
    });
  });
});
