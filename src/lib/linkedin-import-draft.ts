import type { LinkedInParseResult } from "@/lib/linkedin-connections";

export const LINKEDIN_IMPORT_DRAFT_KEY = "crmini.linkedin.import.v1";
export const LINKEDIN_IMPORT_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export type LinkedInImportDraft = {
  savedAt: number;
  fileName: string;
  parsed: LinkedInParseResult;
  selected: number[];
  assignments: Record<string, string>;
  query: string;
  onlySelected: boolean;
  onlyMissing: boolean;
  page: number;
  scrollY: number;
  processed: number[];
  importedContacts: Record<string, string>;
  result: { imported: number; skipped: number } | null;
};

function defaultStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item))
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Recupera o rascunho da importação guardado nesta aba. O rascunho contém
 * apenas os campos normalizados do CSV (nunca o texto bruto) e expira após
 * duas horas para reduzir a retenção de dados pessoais.
 */
export function readLinkedInImportDraft(
  storage: Storage | null = defaultStorage(),
  now = Date.now(),
): LinkedInImportDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LINKEDIN_IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LinkedInImportDraft>;
    if (
      !draft ||
      typeof draft !== "object" ||
      !draft.parsed ||
      !Array.isArray(draft.parsed.connections) ||
      typeof draft.savedAt !== "number"
    ) {
      storage.removeItem(LINKEDIN_IMPORT_DRAFT_KEY);
      return null;
    }
    if (now - draft.savedAt > LINKEDIN_IMPORT_DRAFT_TTL_MS) {
      storage.removeItem(LINKEDIN_IMPORT_DRAFT_KEY);
      return null;
    }
    return {
      savedAt: draft.savedAt,
      fileName: typeof draft.fileName === "string" ? draft.fileName : "",
      parsed: draft.parsed as LinkedInParseResult,
      selected: numberArray(draft.selected),
      assignments: stringRecord(draft.assignments),
      query: typeof draft.query === "string" ? draft.query : "",
      onlySelected: Boolean(draft.onlySelected),
      onlyMissing: Boolean(draft.onlyMissing),
      page:
        Number.isInteger(draft.page) && (draft.page as number) >= 0
          ? (draft.page as number)
          : 0,
      scrollY:
        typeof draft.scrollY === "number" && Number.isFinite(draft.scrollY)
          ? Math.max(0, draft.scrollY)
          : 0,
      processed: numberArray(draft.processed),
      importedContacts: stringRecord(draft.importedContacts),
      result:
        draft.result &&
        typeof draft.result === "object" &&
        typeof draft.result.imported === "number" &&
        typeof draft.result.skipped === "number"
          ? { imported: draft.result.imported, skipped: draft.result.skipped }
          : null,
    };
  } catch {
    try {
      storage.removeItem(LINKEDIN_IMPORT_DRAFT_KEY);
    } catch {
      // Storage indisponível: não há o que limpar.
    }
    return null;
  }
}

export function writeLinkedInImportDraft(
  draft: LinkedInImportDraft,
  storage: Storage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LINKEDIN_IMPORT_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearLinkedInImportDraft(
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(LINKEDIN_IMPORT_DRAFT_KEY);
  } catch {
    // Storage indisponível: nada a fazer.
  }
}
