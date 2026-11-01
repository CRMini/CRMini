import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import { createClient, deactivateClient } from "./clients";
import {
  changeOpportunityStatus,
  createOpportunity,
  getOpportunity,
  listOpportunities,
  updateOpportunity,
} from "./opportunities";

function cleanTables() {
  getDb().exec(
    "DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

let clientId: string;
let contactId: string;
let otherClientId: string;
let otherContactId: string;

beforeEach(async () => {
  cleanTables();
  const client = await createClient({
    company_name: "Empresa Base Ltda.",
    contacts: [{ full_name: "Contato Base", is_primary: true }],
  });
  clientId = client.id;
  const other = await createClient({
    company_name: "Outra Empresa S.A.",
    contacts: [{ full_name: "Outro Contato" }],
  });
  otherClientId = other.id;
  contactId = (
    getDb()
      .prepare("SELECT id FROM contacts WHERE client_id = ?")
      .get(clientId) as { id: string }
  ).id;
  otherContactId = (
    getDb()
      .prepare("SELECT id FROM contacts WHERE client_id = ?")
      .get(otherClientId) as { id: string }
  ).id;
});

const baseOpportunity = () => ({
  name: "Projeto de Integração",
  client_id: clientId,
  contact_id: contactId,
  value: "48000.50",
  budget: 55000,
  project_hours: "320",
  opened_at: "2026-10-01",
  expected_close_at: "",
});

describe("createOpportunity", () => {
  it("cria com valores padrão e preserva decimais como texto exato", async () => {
    const created = (await createOpportunity(baseOpportunity())) as Record<
      string,
      unknown
    >;

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.status).toBe("Em andamento");
    expect(created.currency).toBe("BRL");
    expect(created.opened_at).toBe("2026-10-01");
    // number 55000 é normalizado para texto; string "48000.50" é preservada.
    expect(created.value).toBe("48000.50");
    expect(created.budget).toBe("55000");
    expect(created.project_hours).toBe("320");
    expect(created.expected_close_at).toBeNull();
    expect(created.loss_reason).toBeNull();
  });

  it("usa a data civil atual como abertura padrão", async () => {
    const { opened_at, ...withoutOpenedAt } = baseOpportunity();
    const created = (await createOpportunity(withoutOpenedAt)) as Record<
      string,
      unknown
    >;

    expect(created.opened_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("retorna null quando o cliente está desativado", async () => {
    await deactivateClient(clientId);
    expect(await createOpportunity(baseOpportunity())).toBeNull();
  });

  it("retorna null quando o contato pertence a outro cliente", async () => {
    const created = await createOpportunity({
      ...baseOpportunity(),
      contact_id: otherContactId,
    });
    expect(created).toBeNull();
  });

  it("rejeita status Perdida sem motivo pela constraint do schema", async () => {
    await expect(
      createOpportunity({ ...baseOpportunity(), status: "Perdida" }),
    ).rejects.toThrow(/loss_reason/);
  });

  it("rejeita valores negativos e moeda inválida pelo schema", async () => {
    await expect(
      createOpportunity({ ...baseOpportunity(), value: "-1" }),
    ).rejects.toThrow(/nonnegative/);
    await expect(
      createOpportunity({ ...baseOpportunity(), currency: "GBP" }),
    ).rejects.toThrow(/currency/);
  });
});

describe("changeOpportunityStatus", () => {
  it("altera status e motivo de perda, e retorna null para inexistente", async () => {
    const created = (await createOpportunity(baseOpportunity())) as Record<
      string,
      unknown
    >;

    const updated = await changeOpportunityStatus(
      created.id as string,
      "Perdida",
      "Preço",
    );
    expect(updated).toMatchObject({ id: created.id });

    const stored = getDb()
      .prepare("SELECT status, loss_reason FROM opportunities WHERE id = ?")
      .get(created.id);
    expect(stored).toEqual({ status: "Perdida", loss_reason: "Preço" });

    expect(
      await changeOpportunityStatus(
        "00000000-0000-4000-8000-000000000000",
        "Ganha",
        null,
      ),
    ).toBeNull();
  });
});

describe("updateOpportunity", () => {
  it("atualiza campos informados e preserva os demais", async () => {
    const created = (await createOpportunity(baseOpportunity())) as Record<
      string,
      unknown
    >;

    const updated = (await updateOpportunity(created.id as string, {
      name: "Projeto Renomeado",
      client_id: clientId,
      contact_id: contactId,
      status: "Proposta",
      expected_close_at: "",
    })) as Record<string, unknown>;

    expect(updated.name).toBe("Projeto Renomeado");
    expect(updated.status).toBe("Proposta");
    expect(updated.expected_close_at).toBeNull();
    expect(updated.value).toBe("48000.50");
  });

  it("retorna null quando a associação cliente/contato é inválida", async () => {
    const created = (await createOpportunity(baseOpportunity())) as Record<
      string,
      unknown
    >;

    const updated = await updateOpportunity(created.id as string, {
      name: "Tentativa",
      client_id: otherClientId,
      contact_id: contactId,
    });
    expect(updated).toBeNull();
  });
});

describe("getOpportunity", () => {
  it("retorna a oportunidade com cliente e contato resolvidos", async () => {
    const created = (await createOpportunity(baseOpportunity())) as Record<
      string,
      unknown
    >;

    const found = await getOpportunity(String(created.id));

    expect(found).toMatchObject({
      id: created.id,
      company_name: "Empresa Base Ltda.",
      contact_name: "Contato Base",
      value: "48000.50",
    });
  });

  it("retorna null quando a oportunidade não existe", async () => {
    expect(
      await getOpportunity("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});

describe("listOpportunities", () => {
  it("busca texto ignorando acentos e caixa", async () => {
    await createClient({
      company_name: "São Paulo Ltda.",
      contacts: [{ full_name: "José Silva" }],
    }).then(async (client) => {
      const id = (
        getDb()
          .prepare("SELECT id FROM contacts WHERE client_id = ?")
          .get(client.id) as { id: string }
      ).id;
      await createOpportunity({
        ...baseOpportunity(),
        name: "Projeto São Paulo",
        client_id: client.id,
        contact_id: id,
      });
    });
    expect(await listOpportunities("JOSÉ", null, null)).toHaveLength(1);
    expect(await listOpportunities("sao paulo", null, null)).toHaveLength(1);
  });

  it("filtra por texto, cliente e status", async () => {
    await createOpportunity(baseOpportunity());
    await createOpportunity({
      ...baseOpportunity(),
      name: "E-commerce Novo",
      client_id: otherClientId,
      contact_id: otherContactId,
      status: "Proposta",
    });

    const all = (await listOpportunities(null, null, null)) as unknown[];
    expect(all).toHaveLength(2);

    const byQuery = (await listOpportunities(
      "e-commerce",
      null,
      null,
    )) as Record<string, unknown>[];
    expect(byQuery).toHaveLength(1);
    expect(byQuery[0].company_name).toBe("Outra Empresa S.A.");
    expect(byQuery[0].contact_name).toBe("Outro Contato");

    const byClient = (await listOpportunities(
      null,
      clientId,
      null,
    )) as unknown[];
    expect(byClient).toHaveLength(1);

    const byStatus = (await listOpportunities(
      null,
      null,
      "Proposta",
    )) as unknown[];
    expect(byStatus).toHaveLength(1);
  });
});

describe("integridade referencial", () => {
  it("impede excluir cliente com oportunidade vinculada", async () => {
    await createOpportunity(baseOpportunity());

    expect(() =>
      getDb().prepare("DELETE FROM clients WHERE id = ?").run(clientId),
    ).toThrow(/FOREIGN KEY/);
  });
});
