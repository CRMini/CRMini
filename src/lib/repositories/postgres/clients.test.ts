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
  createClient,
  deactivateClient,
  getClient,
  listClientOptions,
  listClients,
  updateClient,
} from "./clients";

beforeEach(() => {
  poolQuery.mockReset();
  txQuery.mockReset();
});

describe("clients (PostgreSQL) sem banco real", () => {
  describe("listClients", () => {
    it("mapeia contatos nulos para [] e converte booleanos", async () => {
      poolQuery.mockResolvedValue({
        rows: [
          { id: "c1", company_name: "Acme", is_active: 1, contacts: null },
          {
            id: "c2",
            company_name: "Beta",
            is_active: 0,
            contacts: [
              { id: "p1", full_name: "Ana", is_primary: 1, is_active: 0 },
            ],
          },
        ],
      });

      const result = await listClients(null);

      expect(result[0].contacts).toEqual([]);
      expect(result[0].is_active).toBe(true);
      expect(result[1].is_active).toBe(false);
      expect(result[1].contacts[0].is_primary).toBe(true);
      expect(result[1].contacts[0].is_active).toBe(false);
      expect(poolQuery.mock.calls[0][1]).toEqual([null]);
    });

    it("repassa a busca para a consulta", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      await listClients("acme");

      expect(poolQuery.mock.calls[0][1]).toEqual(["acme"]);
    });
  });

  describe("listClientOptions", () => {
    it("filtra inativos por padrão", async () => {
      poolQuery.mockResolvedValue({
        rows: [
          { id: "c1", company_name: "Acme", trade_name: null, is_active: 1 },
        ],
      });

      const result = await listClientOptions();

      expect(poolQuery.mock.calls[0][0]).toContain("WHERE is_active = 1");
      expect(result[0].is_active).toBe(true);
    });

    it("inclui inativos quando solicitado", async () => {
      poolQuery.mockResolvedValue({
        rows: [
          { id: "c1", company_name: "Acme", trade_name: null, is_active: 0 },
        ],
      });

      const result = await listClientOptions(true);

      expect(poolQuery.mock.calls[0][0]).not.toContain("WHERE");
      expect(result[0].is_active).toBe(false);
    });
  });

  describe("createClient", () => {
    it("cria cliente sem contatos usando o país padrão", async () => {
      txQuery.mockResolvedValueOnce({
        rows: [{ id: "c1", company_name: "Acme", is_active: 1 }],
      });

      const result = await createClient({ company_name: "  Acme  " });

      expect(result.is_active).toBe(true);
      const [sql, params] = txQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO clients");
      expect(params[1]).toBe("Acme");
      expect(params[14]).toBe("Brasil");
      expect(txQuery).toHaveBeenCalledTimes(1);
    });

    it("cria cliente com todos os campos e contatos, ignorando sem nome", async () => {
      txQuery.mockResolvedValueOnce({
        rows: [{ id: "c1", company_name: "Acme", is_active: 0 }],
      });
      txQuery.mockResolvedValue({ rows: [] });

      const result = await createClient({
        company_name: "Acme",
        trade_name: "Acme Inc.",
        tax_id: "00.000.000/0000-00",
        industry: "Tecnologia",
        website: "https://acme.example",
        phone: "11 3000-0000",
        email: "contato@acme.example",
        postal_code: "01310-100",
        street: "Av. Paulista",
        street_number: "100",
        complement: "Sala 1",
        city: "São Paulo",
        state: "SP",
        country: "Brasil",
        notes: "Notas",
        logo_path: "/logo.png",
        contacts: [
          { full_name: "   ", is_primary: true },
          {
            full_name: "  Ana  ",
            job_title: "CEO",
            email: "ana@example.com",
            phone: "11 3000-0000",
            mobile: "11 90000-0000",
            birthday: "1990-05-10",
            linkedin_url: "https://www.linkedin.com/in/ana",
            notes: "notas",
            is_primary: true,
          },
          { full_name: "Sem Extras", birthday: "", is_primary: false },
          { is_primary: true },
        ],
      });

      expect(result.is_active).toBe(false);
      expect(txQuery).toHaveBeenCalledTimes(3);

      const contactCalls = txQuery.mock.calls.slice(1);
      expect(contactCalls[0][0]).toContain("INSERT INTO contacts");
      expect(contactCalls[0][1][2]).toBe("Ana");
      expect(contactCalls[0][1][7]).toBe("1990-05-10");
      expect(contactCalls[0][1][10]).toBe(1);

      expect(contactCalls[1][1][2]).toBe("Sem Extras");
      expect(contactCalls[1][1][7]).toBeNull();
      expect(contactCalls[1][1][10]).toBe(0);
    });
  });

  describe("getClient", () => {
    it("retorna cliente encontrado", async () => {
      poolQuery.mockResolvedValue({
        rows: [{ id: "c1", is_active: 1, contacts: [] }],
      });

      const result = await getClient("c1");

      expect(result.found).toBe(true);
      expect(result.client!.is_active).toBe(true);
    });

    it("retorna ausente para cliente inexistente", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      const result = await getClient("missing");

      expect(result.found).toBe(false);
      expect(result.client).toBeUndefined();
    });
  });

  describe("updateClient", () => {
    it("retorna null para cliente inexistente", async () => {
      txQuery.mockResolvedValueOnce({ rows: [] });
      txQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateClient("missing", { company_name: "Acme" });

      expect(result).toBeNull();
      expect(txQuery.mock.calls[1][0]).toContain("UPDATE clients SET");
    });

    it("lança erro para contato de outro cliente", async () => {
      txQuery.mockResolvedValueOnce({
        rows: [{ id: "p1", full_name: "Ana", is_active: 1 }],
      });

      await expect(
        updateClient("c1", {
          company_name: "Acme",
          contacts: [{ id: "outro", full_name: "Outro" }],
        }),
      ).rejects.toThrow("Contato não pertence ao cliente informado.");
    });

    it("atualiza cliente com contato novo, existente e removido", async () => {
      txQuery
        .mockResolvedValueOnce({
          rows: [
            { id: "p1", full_name: "Ana", is_active: 1 },
            { id: "p2", full_name: "Bruno", is_active: 1 },
            { id: "p3", full_name: "Inativo", is_active: 0 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "c1", company_name: "Atualizada", is_active: 1 }],
        })
        .mockResolvedValue({ rows: [] });

      const result = await updateClient("c1", {
        company_name: "Atualizada",
        trade_name: "Novo Nome",
        tax_id: "00.000.000/0000-00",
        industry: "Tecnologia",
        website: "https://site.example",
        phone: "11 3000-0000",
        email: "email@example.com",
        postal_code: "01310-100",
        street: "Rua A",
        street_number: "10",
        complement: "Ap 1",
        city: "São Paulo",
        state: "SP",
        country: "Argentina",
        notes: "Notas",
        logo_path: "/logo.png",
        contacts: [
          {
            id: "p1",
            full_name: "Ana Editada",
            job_title: "CEO",
            email: "ana@example.com",
            birthday: "1990-05-10",
            is_primary: true,
          },
          { full_name: "Carla Nova", is_primary: false },
          {},
        ],
      });

      expect(result!.company_name).toBe("Atualizada");
      expect(result!.is_active).toBe(true);

      const calls = txQuery.mock.calls.map(([sql]) => sql);
      expect(calls[0]).toContain(
        "SELECT id, full_name, is_active FROM contacts",
      );
      expect(calls[1]).toContain("UPDATE clients SET");
      expect(calls[2]).toContain("UPDATE contacts SET");
      expect(calls[3]).toContain("INSERT INTO contacts");
      expect(calls[4]).toContain("UPDATE contacts SET is_active = 0");
    });

    it("mantém contatos existentes sem remover quando todos são mantidos", async () => {
      txQuery
        .mockResolvedValueOnce({
          rows: [{ id: "p1", full_name: "Ana", is_active: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "c1", company_name: "Acme", is_active: 1 }],
        })
        .mockResolvedValue({ rows: [] });

      await updateClient("c1", {
        company_name: "Acme",
        contacts: [{ id: "p1", full_name: "Ana", is_primary: true }],
      });

      const calls = txQuery.mock.calls.map(([sql]) => sql);
      expect(
        calls.filter((sql) =>
          sql.includes("UPDATE contacts SET is_active = 0"),
        ),
      ).toHaveLength(0);
      expect(
        calls.filter((sql) => sql.includes("UPDATE contacts SET")),
      ).toHaveLength(1);
    });
  });

  describe("deactivateClient", () => {
    it("sinaliza cliente encontrado", async () => {
      poolQuery.mockResolvedValue({ rows: [{ id: "c1" }] });

      const result = await deactivateClient("c1");

      expect(result.found).toBe(true);
      expect(result.row).toEqual({ id: "c1" });
    });

    it("sinaliza cliente ausente", async () => {
      poolQuery.mockResolvedValue({ rows: [] });

      const result = await deactivateClient("missing");

      expect(result.found).toBe(false);
      expect(result.row).toBeUndefined();
    });
  });
});
