import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SQLITE_PATH = ":memory:";
});

import { getDb } from "@/lib/db";
import {
  createClient,
  deactivateClient,
  getClient,
  listClientOptions,
  listClients,
  updateClient,
} from "./clients";
import { deactivateContact } from "./contacts";

function cleanTables() {
  getDb().exec(
    "DELETE FROM tasks; DELETE FROM opportunities; DELETE FROM contacts; DELETE FROM clients;",
  );
}

beforeEach(cleanTables);

const baseClient = {
  company_name: "Empresa Exemplo Ltda.",
  trade_name: "Exemplo",
  industry: "Tecnologia da Informação",
  contacts: [
    {
      full_name: "Maria Silva",
      email: "maria@example.com",
      birthday: "1990-05-10",
      is_primary: true,
    },
    { full_name: "João Souza", job_title: "Gerente" },
  ],
};

describe("createClient", () => {
  it("cria cliente e contatos em uma única transação", async () => {
    const client = await createClient(baseClient);

    expect(client.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.is_active).toBe(true);
    expect(client.country).toBe("Brasil");

    const { client: stored, found } = await getClient(client.id);
    expect(found).toBe(true);
    expect(stored!.company_name).toBe("Empresa Exemplo Ltda.");
    expect(stored!.contacts).toHaveLength(2);
    expect(stored!.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          full_name: "Maria Silva",
          birthday: "1990-05-10",
          is_primary: true,
        }),
        expect.objectContaining({
          full_name: "João Souza",
          birthday: null,
          is_primary: false,
        }),
      ]),
    );
  });

  it("ignora contatos sem nome e faz rollback completo em caso de falha", async () => {
    await expect(
      createClient({
        company_name: "Rollback S.A.",
        contacts: [
          { full_name: "   " },
          { full_name: "Válido" },
          { full_name: "Inválido", email: { formato: "não suportado" } },
        ],
      }),
    ).rejects.toThrow();

    expect(await listClients("Rollback")).toHaveLength(0);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get()).toEqual(
      { n: 0 },
    );
  });
});

describe("listClients", () => {
  it("lista todos com contatos agregados e booleanos", async () => {
    await createClient(baseClient);
    await createClient({ company_name: "Outra Companhia", contacts: [] });

    const clients = await listClients(null);

    expect(clients).toHaveLength(2);
    const exemplo = clients.find(
      (client) => client.company_name === "Empresa Exemplo Ltda.",
    )!;
    expect(exemplo.is_active).toBe(true);
    expect(exemplo.contacts).toHaveLength(2);
    expect(
      exemplo.contacts.find((contact: any) => contact.is_primary)?.full_name,
    ).toBe("Maria Silva");
    const outra = clients.find(
      (client) => client.company_name === "Outra Companhia",
    )!;
    expect(outra.contacts).toEqual([]);
  });

  it.each([
    ["nome da empresa", "empresa exemplo", 1],
    ["nome do contato", "maria", 1],
    ["termo sem correspondência", "inexistente", 0],
  ])("filtra por %s", async (_label, search, expected) => {
    await createClient(baseClient);
    expect(await listClients(search)).toHaveLength(expected);
  });

  it("busca nomes sem distinção de acentos ou caixa", async () => {
    await createClient({
      company_name: "São Paulo Comércio",
      contacts: [{ full_name: "José Silva" }],
    });
    expect(await listClients("JOSÉ")).toHaveLength(1);
    expect(await listClients("sao paulo")).toHaveLength(1);
  });
});

describe("getClient", () => {
  it("retorna found=false para cliente inexistente", async () => {
    const result = await getClient("00000000-0000-4000-8000-000000000000");
    expect(result.found).toBe(false);
    expect(result.client).toBeUndefined();
  });
});

describe("updateClient", () => {
  it("atualiza contatos com id existente preservando o id", async () => {
    const client = await createClient(baseClient);
    const { client: stored } = await getClient(client.id);
    const maria = stored!.contacts.find(
      (contact: any) => contact.full_name === "Maria Silva",
    );
    const joao = stored!.contacts.find(
      (contact: any) => contact.full_name === "João Souza",
    );

    await updateClient(client.id, {
      company_name: "Empresa Exemplo Ltda.",
      contacts: [
        { ...maria, full_name: "Maria Silva Atualizada", is_primary: true },
        { ...joao },
        { full_name: "Contato Novo", email: "novo@example.com" },
      ],
    });

    const { client: after } = await getClient(client.id);
    expect(after!.contacts).toHaveLength(3);
    const byId = Object.fromEntries(
      after!.contacts.map((contact: any) => [contact.id, contact]),
    );
    expect(byId[maria.id]).toMatchObject({
      full_name: "Maria Silva Atualizada",
      email: "maria@example.com",
      is_primary: true,
    });
    expect(byId[joao.id]).toMatchObject({ full_name: "João Souza" });
    expect(
      after!.contacts.find(
        (contact: any) => contact.full_name === "Contato Novo",
      )?.id,
    ).not.toBe(maria.id);
  });

  it("desativa contatos ausentes do payload sem apagar a linha", async () => {
    const client = await createClient(baseClient);
    const { client: stored } = await getClient(client.id);
    const maria = stored!.contacts.find(
      (contact: any) => contact.full_name === "Maria Silva",
    );

    await updateClient(client.id, {
      company_name: "Empresa Exemplo Ltda.",
      contacts: [{ ...maria }],
    });

    const { client: after } = await getClient(client.id);
    expect(after!.contacts).toHaveLength(1);
    expect(after!.contacts[0].id).toBe(maria.id);

    const removed = getDb()
      .prepare("SELECT full_name, is_active FROM contacts WHERE id = ?")
      .get(
        stored!.contacts.find(
          (contact: any) => contact.full_name === "João Souza",
        ).id,
      ) as { full_name: string; is_active: number };
    expect(removed).toEqual({ full_name: "João Souza", is_active: 0 });
  });

  it("aceita contato desativado após abrir formulário sem reativá-lo", async () => {
    const client = await createClient(baseClient);
    const { client: stored } = await getClient(client.id);
    const maria = stored!.contacts.find((contact: any) => contact.full_name === "Maria Silva");
    await deactivateContact(maria.id);

    const updated = await updateClient(client.id, {
      company_name: "Empresa Atualizada",
      contacts: [{ ...maria, full_name: "Maria Silva Editada" }],
    });

    expect(updated!.company_name).toBe("Empresa Atualizada");
    expect(getDb().prepare("SELECT is_active FROM contacts WHERE id = ?").get(maria.id)).toEqual({ is_active: 0 });
  });

  it.each([
    [
      "tarefa",
      (clientId: string, contactId: string) =>
        getDb()
          .prepare(
            `INSERT INTO tasks (id, contact_type, subject, scheduled_at, client_id, contact_id)
             VALUES ('task-1', 'email', 'Retorno', '2026-10-25T12:00:00.000Z', ?, ?)`,
          )
          .run(clientId, contactId),
      "SELECT contact_id FROM tasks WHERE id = 'task-1'",
    ],
    [
      "oportunidade",
      (clientId: string, contactId: string) =>
        getDb()
          .prepare(
            `INSERT INTO opportunities (id, name, client_id, contact_id)
             VALUES ('opp-1', 'Projeto', ?, ?)`,
          )
          .run(clientId, contactId),
      "SELECT contact_id FROM opportunities WHERE id = 'opp-1'",
    ],
  ])(
    "desativa contato com %s vinculada preservando linha e vínculo",
    async (_label, insertDependency, dependencyQuery) => {
      const client = await createClient(baseClient);
      const { client: stored } = await getClient(client.id);
      const maria = stored!.contacts.find(
        (contact: any) => contact.full_name === "Maria Silva",
      );
      insertDependency(client.id, maria.id);

      const updated = await updateClient(client.id, {
        company_name: "Nome Aplicado",
        contacts: [{ full_name: "Contato Substituto" }],
      });

      expect(updated!.company_name).toBe("Nome Aplicado");

      const { client: after } = await getClient(client.id);
      expect(after!.company_name).toBe("Nome Aplicado");
      expect(after!.contacts).toHaveLength(1);
      expect(after!.contacts[0].full_name).toBe("Contato Substituto");

      const storedContact = getDb()
        .prepare("SELECT full_name, is_active FROM contacts WHERE id = ?")
        .get(maria.id) as { full_name: string; is_active: number };
      expect(storedContact).toEqual({
        full_name: "Maria Silva",
        is_active: 0,
      });

      const dependency = getDb().prepare(dependencyQuery).get() as {
        contact_id: string;
      };
      expect(dependency.contact_id).toBe(maria.id);

      const activeRows = getDb()
        .prepare(
          "SELECT COUNT(*) AS n FROM contacts WHERE client_id = ? AND is_active = 1",
        )
        .get(client.id) as { n: number };
      expect(activeRows.n).toBe(1);
    },
  );

  it("ignora contatos desativados na busca e na listagem do cliente", async () => {
    const client = await createClient(baseClient);
    const { client: stored } = await getClient(client.id);
    const maria = stored!.contacts.find(
      (contact: any) => contact.full_name === "Maria Silva",
    );

    await deactivateContact(maria.id);

    const { client: after } = await getClient(client.id);
    expect(after!.contacts).toHaveLength(1);
    expect(after!.contacts[0].full_name).toBe("João Souza");
    expect(after!.contacts.map((contact: any) => contact.id)).not.toContain(
      maria.id,
    );

    const all = await listClients(null);
    expect(all[0].contacts).toHaveLength(1);
    expect(all[0].contacts[0].full_name).toBe("João Souza");

    expect(await listClients("maria")).toHaveLength(0);
    expect(await listClients("Empresa Exemplo")).toHaveLength(1);
  });

  it("atualiza dados da empresa e substitui os contatos", async () => {
    const client = await createClient(baseClient);

    const updated = await updateClient(client.id, {
      company_name: "Empresa Renomeada",
      country: "",
      contacts: [{ full_name: "Novo Contato", is_primary: true }],
    });

    expect(updated!.company_name).toBe("Empresa Renomeada");
    expect(updated!.country).toBe("Brasil");

    const { client: stored } = await getClient(client.id);
    expect(stored!.contacts).toHaveLength(1);
    expect(stored!.contacts[0]).toMatchObject({
      full_name: "Novo Contato",
      is_primary: true,
    });
  });

  it("retorna null para cliente inexistente sem criar contatos", async () => {
    const result = await updateClient("00000000-0000-4000-8000-000000000000", {
      company_name: "Qualquer",
      contacts: [{ full_name: "Contato" }],
    });
    expect(result).toBeNull();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get()).toEqual(
      { n: 0 },
    );
  });

  it("faz rollback mantendo dados anteriores quando um contato falha", async () => {
    const client = await createClient(baseClient);

    await expect(
      updateClient(client.id, {
        company_name: "Nome Alterado",
        contacts: [{ full_name: "Inválido", email: { formato: "ruim" } }],
      }),
    ).rejects.toThrow();

    const { client: stored } = await getClient(client.id);
    expect(stored!.company_name).toBe("Empresa Exemplo Ltda.");
    expect(stored!.contacts).toHaveLength(2);
  });
});

describe("listClientOptions", () => {
  it("lista apenas ativos por padrão e inclui inativos quando solicitado", async () => {
    const active = await createClient({ company_name: "Ativa Ltda." });
    const inactive = await createClient({ company_name: "Inativa Ltda." });
    await deactivateClient(inactive.id);

    const onlyActive = await listClientOptions();
    expect(onlyActive).toEqual([
      { id: active.id, company_name: "Ativa Ltda.", trade_name: null, is_active: true },
    ]);

    const all = await listClientOptions(true);
    expect(all).toEqual([
      { id: active.id, company_name: "Ativa Ltda.", trade_name: null, is_active: true },
      { id: inactive.id, company_name: "Inativa Ltda.", trade_name: null, is_active: false },
    ]);
  });
});

describe("deactivateClient", () => {
  it("desativa preservando o registro e sinaliza inexistentes", async () => {
    const client = await createClient(baseClient);

    const result = await deactivateClient(client.id);
    expect(result.found).toBe(true);

    const { client: stored } = await getClient(client.id);
    expect(stored!.is_active).toBe(false);

    const missing = await deactivateClient(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing.found).toBe(false);
  });
});

describe("integridade referencial", () => {
  it("remove contatos em cascata quando o cliente é excluído no banco", async () => {
    const client = await createClient(baseClient);

    getDb().prepare("DELETE FROM clients WHERE id = ?").run(client.id);

    expect(getDb().prepare("SELECT COUNT(*) AS n FROM contacts").get()).toEqual(
      { n: 0 },
    );
  });
});
