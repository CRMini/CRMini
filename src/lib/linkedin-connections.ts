import { normalizeSearch } from "@/lib/normalize-search";

export const LINKEDIN_CSV_LIMITS = {
  /** Tamanho máximo aceito para o arquivo exportado pelo LinkedIn. */
  maxBytes: 5 * 1024 * 1024,
  /** Quantidade máxima de conexões processadas em uma importação. */
  maxRows: 10_000,
  /** Limite de caracteres para campos livres vindos do arquivo. */
  maxFieldLength: 500,
} as const;

export type LinkedInIssueCode =
  | "missing_name"
  | "missing_company"
  | "invalid_email"
  | "invalid_url"
  | "invalid_date"
  | "name_too_long"
  | "position_truncated"
  | "duplicate_in_file";

export type LinkedInIssue = {
  code: LinkedInIssueCode;
  message: string;
};

export type LinkedInConnection = {
  /** Índice do registro de dados no arquivo (1-based, sem contar o cabeçalho). */
  rowId: number;
  fullName: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  linkedinUrl: string | null;
  /** Data civil no formato YYYY-MM-DD; nunca representa um instante. */
  connectedOn: string | null;
  issues: LinkedInIssue[];
};

export type LinkedInParseResult = {
  connections: LinkedInConnection[];
  rowsRead: number;
  invalidCount: number;
  delimiter: "," | ";" | "\t";
};

export type LinkedInCsvErrorCode =
  | "empty_file"
  | "no_header"
  | "too_many_rows"
  | "unclosed_quote";

export class LinkedInCsvError extends Error {
  readonly code: LinkedInCsvErrorCode;

  constructor(code: LinkedInCsvErrorCode, message: string) {
    super(message);
    this.name = "LinkedInCsvError";
    this.code = code;
  }
}

type ColumnName =
  | "firstName"
  | "lastName"
  | "url"
  | "email"
  | "company"
  | "position"
  | "connectedOn";
type ColumnMap = Partial<Record<ColumnName, number>>;

const HEADER_ALIASES: Record<ColumnName, string[]> = {
  firstName: ["first name"],
  lastName: ["last name"],
  url: ["url", "profile url"],
  email: ["email address", "email"],
  company: ["company"],
  position: ["position", "title"],
  connectedOn: ["connected on", "connected"],
};

const BLOCKING_ISSUES = new Set<LinkedInIssueCode>([
  "missing_name",
  "name_too_long",
  "duplicate_in_file",
]);

const MESSAGE_BY_CODE: Record<LinkedInIssueCode, string> = {
  missing_name: "Nome não informado. Esta conexão não pode ser importada.",
  missing_company:
    "Empresa não informada. Vincule a esta pessoa a uma empresa existente.",
  invalid_email: "E-mail inválido ignorado.",
  invalid_url: "Perfil do LinkedIn inválido ignorado.",
  invalid_date: "Data de conexão inválida.",
  name_too_long: "Nome muito longo (máximo de 200 caracteres).",
  position_truncated: "Cargo reduzido a 200 caracteres.",
  duplicate_in_file: "Esta conexão aparece mais de uma vez no arquivo.",
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DELIMITERS = [",", ";", "\t"] as const;

function issue(code: LinkedInIssueCode): LinkedInIssue {
  return { code, message: MESSAGE_BY_CODE[code] };
}

function collapseWhitespace(value: string): string {
  return value.replace(/[\s\u00a0]+/g, " ").trim();
}

function normalizeHeaderCell(value: string): string {
  return collapseWhitespace(normalizeSearch(value) || "").toLowerCase();
}

/**
 * Parser CSV no espírito do RFC 4180: aceita aspas, `""` como aspas literais,
 * vírgulas e quebras de linha dentro de campos e CRLF.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      inQuotes = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character === "\r") {
      if (input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new LinkedInCsvError(
      "unclosed_quote",
      "Arquivo inválido: há aspas não fechadas no CSV.",
    );
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function findHeader(rows: string[][]): {
  index: number;
  columns: ColumnMap;
} | null {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const columns: ColumnMap = {};
    rows[index].forEach((cell, cellIndex) => {
      const normalized = normalizeHeaderCell(cell);
      (Object.keys(HEADER_ALIASES) as ColumnName[]).forEach((name) => {
        if (columns[name] === undefined && HEADER_ALIASES[name].includes(normalized)) {
          columns[name] = cellIndex;
        }
      });
    });
    if (columns.firstName !== undefined && columns.lastName !== undefined) {
      return { index, columns };
    }
  }
  return null;
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .slice(0, 20);

  const headerLine = lines.find((line) => {
    const normalized = normalizeHeaderCell(line);
    return normalized.includes("first name") && normalized.includes("last name");
  });

  if (!headerLine) {
    throw new LinkedInCsvError(
      "no_header",
      "Arquivo inválido: cabeçalho do LinkedIn não encontrado. Exporte novamente suas conexões.",
    );
  }

  let selected: "," | ";" | "\t" = ",";
  let selectedCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = headerLine.split(delimiter).length - 1;
    if (count > selectedCount) {
      selected = delimiter;
      selectedCount = count;
    }
  }
  return selected;
}

function readCell(row: string[], columns: ColumnMap, name: ColumnName): string {
  const index = columns[name];
  return index === undefined ? "" : (row[index] ?? "");
}

export function normalizeCompanyKey(value: string | null | undefined): string {
  if (!value) return "";
  return collapseWhitespace(normalizeSearch(value) || "").toLowerCase();
}

export function normalizeEmailKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * Valida um perfil do LinkedIn e devolve uma chave estável para comparação.
 * Retorna null quando a URL não é um perfil válido.
 */
export function normalizeLinkedInProfileUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LINKEDIN_CSV_LIMITS.maxFieldLength) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  if (!path.startsWith("/in/") && !path.startsWith("/pub/")) return null;

  return `${host}${path}`;
}

function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Converte "31 Oct 2026" em "2026-10-31" sem criar um instante/fuso. */
export function parseConnectedOn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(raw.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLinkedInConnectionImportable(
  connection: LinkedInConnection,
): boolean {
  return !connection.issues.some((item) => BLOCKING_ISSUES.has(item.code));
}

export function parseLinkedInConnectionsCsv(text: string): LinkedInParseResult {
  if (!text || !text.trim()) {
    throw new LinkedInCsvError(
      "empty_file",
      "O arquivo está vazio. Selecione o Connections.csv exportado pelo LinkedIn.",
    );
  }

  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  const header = findHeader(rows);

  if (!header) {
    throw new LinkedInCsvError(
      "no_header",
      "Arquivo inválido: cabeçalho do LinkedIn não encontrado. Exporte novamente suas conexões.",
    );
  }

  const connections: LinkedInConnection[] = [];
  const seenUrls = new Set<string>();
  const seenEmails = new Set<string>();
  let rowsRead = 0;

  for (let index = header.index + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => !cell.trim())) continue;

    rowsRead += 1;
    if (rowsRead > LINKEDIN_CSV_LIMITS.maxRows) {
      throw new LinkedInCsvError(
        "too_many_rows",
        `O arquivo tem mais de ${LINKEDIN_CSV_LIMITS.maxRows.toLocaleString("pt-BR")} conexões. Importe em partes.`,
      );
    }

    const issues: LinkedInIssue[] = [];
    const firstName = collapseWhitespace(readCell(row, header.columns, "firstName"));
    const lastName = collapseWhitespace(readCell(row, header.columns, "lastName"));
    const fullName = collapseWhitespace(`${firstName} ${lastName}`);

    if (!fullName) {
      issues.push(issue("missing_name"));
    } else if (fullName.length > 200) {
      issues.push(issue("name_too_long"));
    }

    const company = collapseWhitespace(readCell(row, header.columns, "company"));
    if (!company) issues.push(issue("missing_company"));

    const rawEmail = readCell(row, header.columns, "email").trim();
    let email: string | null = null;
    if (rawEmail) {
      if (isValidEmail(rawEmail)) email = rawEmail;
      else issues.push(issue("invalid_email"));
    }

    const rawUrl = readCell(row, header.columns, "url").trim();
    let linkedinUrl: string | null = null;
    if (rawUrl) {
      if (normalizeLinkedInProfileUrl(rawUrl)) linkedinUrl = rawUrl;
      else issues.push(issue("invalid_url"));
    }

    let jobTitle = collapseWhitespace(readCell(row, header.columns, "position"));
    if (jobTitle.length > 200) {
      jobTitle = jobTitle.slice(0, 200);
      issues.push(issue("position_truncated"));
    }

    const rawConnectedOn = readCell(row, header.columns, "connectedOn").trim();
    const connectedOn = parseConnectedOn(rawConnectedOn);
    if (rawConnectedOn && !connectedOn) issues.push(issue("invalid_date"));

    const urlKey = normalizeLinkedInProfileUrl(linkedinUrl);
    if (urlKey) {
      if (seenUrls.has(urlKey)) issues.push(issue("duplicate_in_file"));
      else seenUrls.add(urlKey);
    }

    const emailKey = normalizeEmailKey(email);
    if (emailKey) {
      if (seenEmails.has(emailKey)) issues.push(issue("duplicate_in_file"));
      else seenEmails.add(emailKey);
    }

    connections.push({
      rowId: rowsRead,
      fullName,
      company,
      jobTitle: jobTitle || null,
      email,
      linkedinUrl,
      connectedOn,
      issues,
    });
  }

  return {
    connections,
    rowsRead,
    invalidCount: connections.filter(
      (connection) => !isLinkedInConnectionImportable(connection),
    ).length,
    delimiter,
  };
}
