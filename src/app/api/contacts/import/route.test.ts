import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { planContactImport, createContactsBatch } = vi.hoisted(() => ({
  planContactImport: vi.fn(),
  createContactsBatch: vi.fn(),
}));
vi.mock("@/lib/repositories/contacts", () => ({ planContactImport, createContactsBatch }));

import { POST } from "./route";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/contacts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(body: string) {
  return new NextRequest("http://localhost/api/contacts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const validItem = { rowId: 1, clientId: "client-1", fullName: "Ana Souza" };

describe("POST /api/contacts/import", () => {
  beforeEach(() => {
    planContactImport.mockReset();
    createContactsBatch.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("importa em lote e retorna counts mistos", async () => {
    createContactsBatch.mockResolvedValue([
      { rowId: 1, status: "imported", contactId: "c1" },
      { rowId: 2, status: "imported", contactId: "c2" },
      { rowId: 3, status: "duplicate", existingContactId: "c1" },
    ]);

    const payload = {
      dryRun: false,
      items: [
        validItem,
        { rowId: 2, clientId: "client-2", fullName: "Bia Souza" },
        { rowId: 3, clientId: "client-1", fullName: "Ana Souza" },
      ],
    };
    const response = await POST(postRequest(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: false,
      counts: { received: 3, imported: 2, wouldImport: 0, skipped: 1 },
      items: [
        { rowId: 1, status: "imported", contactId: "c1" },
        { rowId: 2, status: "imported", contactId: "c2" },
        { rowId: 3, status: "duplicate", existingContactId: "c1" },
      ],
    });
    expect(createContactsBatch).toHaveBeenCalledWith([
      {
        rowId: 1,
        clientId: "client-1",
        fullName: "Ana Souza",
        jobTitle: null,
        email: null,
        linkedinUrl: null,
      },
      {
        rowId: 2,
        clientId: "client-2",
        fullName: "Bia Souza",
        jobTitle: null,
        email: null,
        linkedinUrl: null,
      },
      {
        rowId: 3,
        clientId: "client-1",
        fullName: "Ana Souza",
        jobTitle: null,
        email: null,
        linkedinUrl: null,
      },
    ]);
    expect(planContactImport).not.toHaveBeenCalled();
  });

  it("repassa dryRun=true para planContactImport", async () => {
    planContactImport.mockResolvedValue([
      { rowId: 1, status: "would_import" },
      { rowId: 2, status: "duplicate_in_batch" },
    ]);

    const response = await POST(
      postRequest({
        dryRun: true,
        items: [
          { rowId: 1, clientId: "client-1", fullName: "Ana", jobTitle: "PM" },
          { rowId: 2, clientId: "client-1", fullName: "Ana", email: null, linkedinUrl: "https://www.linkedin.com/in/ana" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: true,
      counts: { received: 2, imported: 0, wouldImport: 1, skipped: 1 },
      items: [
        { rowId: 1, status: "would_import" },
        { rowId: 2, status: "duplicate_in_batch" },
      ],
    });
    expect(planContactImport).toHaveBeenCalledTimes(1);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("retorna 200 com counts zerados quando todos são ignorados", async () => {
    createContactsBatch.mockResolvedValue([
      { rowId: 1, status: "invalid_name" },
      { rowId: 2, status: "invalid_client" },
    ]);

    const response = await POST(
      postRequest({
        items: [
          { rowId: 1, clientId: "client-1", fullName: "" },
          { rowId: 2, clientId: "client-1", fullName: "Ana" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: false,
      counts: { received: 2, imported: 0, wouldImport: 0, skipped: 2 },
      items: [
        { rowId: 1, status: "invalid_name" },
        { rowId: 2, status: "invalid_client" },
      ],
    });
  });

  it("rejeita corpo que não é JSON", async () => {
    const response = await POST(rawPostRequest("não é json"));

    expect(response.status).toBe(400);
    expect(planContactImport).not.toHaveBeenCalled();
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita payload que não é objeto", async () => {
    const response = await POST(rawPostRequest("[1,2,3]"));

    expect(response.status).toBe(400);
    expect(planContactImport).not.toHaveBeenCalled();
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita items vazio", async () => {
    const response = await POST(postRequest({ items: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A lista de itens deve ter entre 1 e 1000 contatos.",
    });
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita mais de 1000 itens", async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({
      rowId: i + 1,
      clientId: "client-1",
      fullName: `Nome ${i}`,
    }));
    const response = await POST(postRequest({ items }));

    expect(response.status).toBe(400);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita rowId inválido", async () => {
    const response = await POST(
      postRequest({ items: [{ rowId: "1", clientId: "client-1", fullName: "Ana" }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "O campo rowId deve ser um número.",
    });
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita clientId vazio", async () => {
    const response = await POST(
      postRequest({ items: [{ rowId: 1, clientId: "  ", fullName: "Ana" }] }),
    );

    expect(response.status).toBe(400);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita fullName que não é string", async () => {
    const response = await POST(
      postRequest({ items: [{ rowId: 1, clientId: "client-1", fullName: 42 }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "O campo fullName deve ser uma string.",
    });
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita campo opcional com tipo inválido", async () => {
    const response = await POST(
      postRequest({
        items: [{ rowId: 1, clientId: "client-1", fullName: "Ana", email: 123 }],
      }),
    );

    expect(response.status).toBe(400);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita dryRun que não é booleano", async () => {
    const response = await POST(
      postRequest({ dryRun: "yes", items: [validItem] }),
    );

    expect(response.status).toBe(400);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita e-mail inválido", async () => {
    const response = await POST(
      postRequest({
        items: [{ ...validItem, email: "email-invalido" }],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "E-mail inválido." });
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita perfil do LinkedIn que não é de pessoa", async () => {
    const response = await POST(
      postRequest({
        items: [
          {
            ...validItem,
            linkedinUrl: "https://www.linkedin.com/company/acme",
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Perfil do LinkedIn inválido.",
    });
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("rejeita cargo acima de 200 caracteres", async () => {
    const response = await POST(
      postRequest({
        items: [{ ...validItem, jobTitle: "P".repeat(201) }],
      }),
    );

    expect(response.status).toBe(400);
    expect(createContactsBatch).not.toHaveBeenCalled();
  });

  it("remove espaços dos campos opcionais antes de importar", async () => {
    createContactsBatch.mockResolvedValue([
      { rowId: 1, status: "imported", contactId: "c1" },
    ]);

    const response = await POST(
      postRequest({
        items: [
          {
            ...validItem,
            clientId: "  client-1  ",
            jobTitle: "  PM  ",
            email: "  ana@example.com  ",
            linkedinUrl:
              "  https://www.linkedin.com/in/ana-souza/  ",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(createContactsBatch).toHaveBeenCalledWith([
      {
        rowId: 1,
        clientId: "client-1",
        fullName: "Ana Souza",
        jobTitle: "PM",
        email: "ana@example.com",
        linkedinUrl: "https://www.linkedin.com/in/ana-souza/",
      },
    ]);
  });

  it("retorna 500 sem vazar detalhes quando o repositório falha", async () => {
    createContactsBatch.mockRejectedValue(new Error("database is locked"));

    const response = await POST(postRequest({ items: [validItem] }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível importar os contatos.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
