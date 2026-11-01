import { describe, expect, it } from "vitest";
import {
  LINKEDIN_IMPORT_DRAFT_KEY,
  LINKEDIN_IMPORT_DRAFT_TTL_MS,
  clearLinkedInImportDraft,
  readLinkedInImportDraft,
  writeLinkedInImportDraft,
  type LinkedInImportDraft,
} from "./linkedin-import-draft";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

function draft(overrides: Partial<LinkedInImportDraft> = {}): LinkedInImportDraft {
  return {
    savedAt: 1_000,
    fileName: "Connections.csv",
    parsed: {
      connections: [
        {
          rowId: 1,
          fullName: "Pessoa Exemplo",
          company: "Empresa Alfa",
          jobTitle: "Analista",
          email: "pessoa@example.test",
          linkedinUrl: "https://www.linkedin.com/in/pessoa-exemplo",
          connectedOn: "2026-10-31",
          issues: [],
        },
      ],
      rowsRead: 1,
      invalidCount: 0,
      delimiter: ",",
    },
    selected: [1],
    assignments: { "1": "client-1" },
    query: "alfa",
    onlySelected: true,
    onlyMissing: false,
    page: 2,
    scrollY: 480,
    processed: [3],
    importedContacts: { "3": "contact-3" },
    result: { imported: 1, skipped: 0 },
    ...overrides,
  };
}

describe("rascunho da importação do LinkedIn", () => {
  it("grava e recupera o estado completo", () => {
    const storage = new MemoryStorage();
    expect(writeLinkedInImportDraft(draft(), storage)).toBe(true);

    expect(readLinkedInImportDraft(storage, 1_500)).toEqual(draft());
  });

  it("descarta rascunhos expirados", () => {
    const storage = new MemoryStorage();
    writeLinkedInImportDraft(draft(), storage);

    expect(
      readLinkedInImportDraft(storage, 1_000 + LINKEDIN_IMPORT_DRAFT_TTL_MS + 1),
    ).toBeNull();
    expect(storage.getItem(LINKEDIN_IMPORT_DRAFT_KEY)).toBeNull();
  });

  it("descarta conteúdo corrompido ou sem o formato esperado", () => {
    const storage = new MemoryStorage();
    storage.setItem(LINKEDIN_IMPORT_DRAFT_KEY, "{não é json");
    expect(readLinkedInImportDraft(storage)).toBeNull();
    expect(storage.getItem(LINKEDIN_IMPORT_DRAFT_KEY)).toBeNull();

    storage.setItem(
      LINKEDIN_IMPORT_DRAFT_KEY,
      JSON.stringify({ savedAt: 1_000, parsed: { connections: "não" } }),
    );
    expect(readLinkedInImportDraft(storage)).toBeNull();
  });

  it("normaliza campos inválidos de um rascunho antigo", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LINKEDIN_IMPORT_DRAFT_KEY,
      JSON.stringify({
        savedAt: 1_000,
        fileName: 42,
        parsed: { connections: [], rowsRead: 0, invalidCount: 0, delimiter: "," },
        selected: [1, "2", 3.5],
        assignments: { ok: "client-1", ruim: 7 },
        query: 9,
        onlySelected: "sim",
        onlyMissing: null,
        page: -2,
        scrollY: "alto",
        processed: null,
        importedContacts: null,
        result: { imported: 1 },
      }),
    );

    const restored = readLinkedInImportDraft(storage, 1_500);

    expect(restored).toMatchObject({
      fileName: "",
      selected: [1],
      assignments: { ok: "client-1" },
      query: "",
      onlySelected: true,
      onlyMissing: false,
      page: 0,
      scrollY: 0,
      processed: [],
      importedContacts: {},
      result: null,
    });
  });

  it("remove o rascunho explicitamente", () => {
    const storage = new MemoryStorage();
    writeLinkedInImportDraft(draft(), storage);
    clearLinkedInImportDraft(storage);
    expect(storage.getItem(LINKEDIN_IMPORT_DRAFT_KEY)).toBeNull();
  });

  it("não quebra quando o storage falha ou não existe", () => {
    const failing = {
      getItem: () => {
        throw new Error("indisponível");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("indisponível");
      },
    } as unknown as Storage;

    expect(writeLinkedInImportDraft(draft(), failing)).toBe(false);
    expect(readLinkedInImportDraft(failing)).toBeNull();
    expect(() => clearLinkedInImportDraft(failing)).not.toThrow();
    expect(writeLinkedInImportDraft(draft(), null)).toBe(false);
    expect(readLinkedInImportDraft(null)).toBeNull();
  });
});
