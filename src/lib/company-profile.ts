/**
 * Extração pura (sem I/O) dos dados cadastrais de uma empresa a partir do
 * HTML da home do site. Determinística: recebe apenas `html` + `baseUrl` e não
 * lê rede, disco nem ambiente. Mesmo estilo tolerante por regex de
 * `site-logo.ts`.
 */
import { isValidCnpj } from "./cnpj";
import { isValidEmail } from "./email";
import { formatCep, formatCnpj } from "./masks";
import { formatPhoneForDisplay, phoneDigits } from "./phone";

export type FieldSource =
  "json-ld" | "opengraph" | "microdata" | "links" | "text";

export type Confidence = "high" | "medium" | "low";

export type CompanyField = {
  value: string;
  source: FieldSource;
  confidence: Confidence;
};

export type ClientFieldKey =
  | "company_name"
  | "trade_name"
  | "tax_id"
  | "phone"
  | "email"
  | "postal_code"
  | "street"
  | "street_number"
  | "city"
  | "state"
  | "country";

export const COMPANY_PROFILE_FIELDS: readonly ClientFieldKey[] = [
  "company_name",
  "trade_name",
  "tax_id",
  "phone",
  "email",
  "postal_code",
  "street",
  "street_number",
  "city",
  "state",
  "country",
];

export type CompanyProfile = {
  fields: Partial<Record<ClientFieldKey, CompanyField>>;
};

const entities: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|quot|#39|lt|gt);/g,
    (entity) => entities[entity] ?? entity,
  );
}

/** Lê atributos de uma tag tolerando HTML malformado e ordem variável. */
function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/"'>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").trim());
}

const organizationTypes = new Set([
  "organization",
  "localbusiness",
  "corporation",
  "ngo",
]);

function isOrganizationNode(node: unknown): node is Record<string, unknown> {
  if (typeof node !== "object" || node === null) return false;

  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") {
    const lower = type.toLowerCase();
    if (organizationTypes.has(lower)) return true;
    return lower.endsWith("organization") || lower.endsWith("business");
  }
  if (Array.isArray(type)) {
    return type.some((item) => {
      if (typeof item !== "string") return false;
      const lower = item.toLowerCase();
      if (organizationTypes.has(lower)) return true;
      return lower.endsWith("organization") || lower.endsWith("business");
    });
  }
  return false;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function firstText(node: Record<string, unknown>, key: string): string {
  const value = node[key];
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = asText(item);
      if (text) return text;
    }
    return "";
  }
  return asText(value);
}

/** Achata arrays e `@graph` recursivamente em uma lista de nós JSON-LD. */
function flattenNodes(value: unknown, out: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) flattenNodes(item, out);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  if (graph !== undefined) {
    flattenNodes(graph, out);
    return;
  }
  out.push(value);
}

/**
 * Extrai o JSON-LD dos blocos `<script type="application/ld+json">`, tolerando
 * aspas simples ou duplas, atributos em qualquer ordem, conteúdo multilinha e
 * blocos malformados (que são descartados sem derrubar os demais).
 */
function extractJsonLdNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const tag = match[0];
    const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const typeValue = (type?.[1] ?? type?.[2] ?? "").toLowerCase();
    if (!typeValue.includes("application/ld+json")) continue;

    const content = match[1].trim();
    if (!content) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    flattenNodes(parsed, nodes);
  }
  return nodes;
}

function organizationNodes(html: string): Record<string, unknown>[] {
  return extractJsonLdNodes(html).filter(isOrganizationNode);
}

/** Primeiro objeto de um `address` que pode ser objeto único ou array. */
function firstAddressObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "object" && item !== null)
        return item as Record<string, unknown>;
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Extrai o valor de `identifier` (string, `value` ou `@value`). */
function identifierText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object" || value === null) return "";

  const record = value as Record<string, unknown>;
  // `value`/`@value` cobre também o identificador composto
  // (ex.: {"propertyID": "CNPJ", "value": "..."}); `propertyID` não é lido.
  return asText(record["value"] ?? record["@value"]);
}

function identifierValues(node: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of ["taxID", "vatID", "identifier"]) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = identifierText(item);
        if (text) values.push(text);
      }
    } else {
      const text = identifierText(value);
      if (text) values.push(text);
    }
  }
  return values;
}

/**
 * Remove `<script>`/`<style>` (com conteúdo), depois toda tag (atributos como
 * `data-cnpj`, `content` e `href` não são texto visível) e decodifica entidades.
 */
function visibleText(html: string): string {
  const withoutHidden = html.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    " ",
  );
  const withoutTags = withoutHidden.replace(/<[^>]*>/g, " ");
  return decodeEntities(withoutTags);
}

const cnpjTextPattern =
  /(?:^|[^0-9A-Za-z])([0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2})(?=[^0-9A-Za-z]|$)/g;

function extractCnpjFromText(text: string): string | null {
  cnpjTextPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = cnpjTextPattern.exec(text)) !== null) {
    const candidate = match[1];
    if (isValidCnpj(candidate)) return formatCnpj(candidate);
  }
  return null;
}

// Prefixos de serviço/cobrança sem DDD local que não servem como telefone da
// empresa: 0800/0800, 0300, 4004, 3003.
const servicePrefixPattern = /^(0800|0300|4004|3003)/;

// DDDs brasileiros ocupam 2 dígitos, então um número completo tem 10 ou 11
// dígitos. Prefixos internacionais com 12/13 dígitos são reconhecidos apenas
// quando começam com `55` (Brasil), sem ambiguidade com o DDD 55 (Santa
// Maria/RS): devolve o número local ou `null` quando não há prefixo a remover.
const brazilCountryCode = "55";

function brazilLocalDigits(digits: string): string | null {
  if (digits.length < 12 || digits.length > 13) return null;
  if (!digits.startsWith(brazilCountryCode)) return null;
  return digits.slice(brazilCountryCode.length);
}

function isValidPhoneCandidate(raw: string): boolean {
  const rawDigits = phoneDigits(raw);
  const digits = brazilLocalDigits(rawDigits) ?? rawDigits;
  if (digits.length < 10 || digits.length > 11) return false;
  if (digits.startsWith("0")) return false;
  if (servicePrefixPattern.test(digits)) return false;
  if (/^0+$/.test(digits.slice(2))) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (/ramal/i.test(raw) || /\bx\d+\b/i.test(raw)) return false;
  return true;
}

function filterPhone(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (!isValidPhoneCandidate(text)) return "";

  // Com prefixo +55 devolve o número local formatado; `formatPhoneForDisplay`
  // só é chamado com o valor original quando não há prefixo a remover.
  const local = brazilLocalDigits(phoneDigits(text));
  return formatPhoneForDisplay(local ?? text);
}

// Telefone brasileiro com DDD: (11) 3456-7890, 11 3456-7890, 11 34567890 etc.
// Limites de dígito evitam casar pedaços no meio de números maiores.
const phoneTextPattern =
  /(?<!\d)(?:\+?55[\s-]*)?\(?([1-9][0-9])\)?[\s.-]?(9?[0-9]{4})[\s.-]?([0-9]{4})(?!\d)/g;

function extractPhoneFromText(text: string): string | null {
  // Remove tokens com forma de CNPJ (ex.: `11222333000181`) para não derivar
  // telefone de um número fiscal.
  const source = text.replace(cnpjTextPattern, " ");
  phoneTextPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = phoneTextPattern.exec(source)) !== null) {
    // Reconstrói só o número local (DDD + assinante) para não tratar o 55
    // opcional como prefixo internacional.
    const filtered = filterPhone(match[1] + match[2] + match[3]);
    if (filtered) return filtered;
  }
  return null;
}

/** Conteúdo de uma tag com `itemprop`, preferindo o atributo `content`. */
function microdataValue(html: string, itemprop: string): string {
  const pattern = new RegExp(
    `<[^>]*\\bitemprop\\s*=\\s*["']${itemprop}["'][^>]*>`,
    "i",
  );
  const match = pattern.exec(html);
  if (!match) return "";

  const tag = match[0];
  const attributes = readAttributes(tag);
  const content = attributes["content"];
  if (content !== undefined) return content.trim();

  // O texto vive depois da tag de abertura: fatia até o próximo `<`.
  const start = (match.index ?? 0) + tag.length;
  const rest = html.slice(start);
  const end = rest.indexOf("<");
  const text = end === -1 ? rest : rest.slice(0, end);
  return stripTags(text);
}

/**
 * Nome a partir de microdata de Organization: procura o primeiro `itemtype`
 * de Organization e lê o `itemprop="name"` apenas do trecho seguinte, para não
 * capturar `name` de uma `Person`/`Product` anterior no documento.
 */
function microdataOrganizationName(html: string): string {
  const marker =
    /<[^>]*\bitemtype\s*=\s*["'][^"']*Organization[^"']*["'][^>]*>/i.exec(html);
  if (!marker) return "";
  const start = (marker.index ?? 0) + marker[0].length;
  return microdataValue(html.slice(start, start + 8000), "name");
}

function ogSiteName(html: string): string {
  const pattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const attributes = readAttributes(match[0]);
    const property = (
      attributes["property"] ??
      attributes["name"] ??
      ""
    ).toLowerCase();
    if (property !== "og:site_name") continue;
    const content = attributes["content"]?.trim();
    if (content) return content;
  }
  return "";
}

const hostingDomainPatterns = [
  "wix",
  "squarespace",
  "weebly",
  "webnode",
  "site123",
  "godaddy",
  "wordpress",
  "hostinger",
];

const exampleDomains = new Set([
  "example.com",
  "example.org",
  "example.net",
  "email.com",
  "domain.com",
]);

const noReplyPattern = /^(?:no-?reply|do-not-reply|webmaster)(?:[.-]|$)/i;

function emailHost(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).replace(/^www\./i, "");
}

function isRejectedEmail(email: string): boolean {
  if (noReplyPattern.test(email.split("@")[0])) return true;

  const host = emailHost(email);
  if (exampleDomains.has(host)) return true;
  return hostingDomainPatterns.some((token) => host.includes(token));
}

/** Domínio próprio do site: hostname de `baseUrl` ou subdomínio dele. */
function isOwnDomain(email: string, baseHost: string): boolean {
  const host = emailHost(email);
  if (host === baseHost) return true;
  return host.endsWith(`.${baseHost}`);
}

function collectEmailCandidates(
  html: string,
  orgNodes: Record<string, unknown>[],
): { value: string; source: FieldSource }[] {
  const candidates: { value: string; source: FieldSource }[] = [];

  for (const node of orgNodes) {
    const email = firstText(node, "email");
    if (email) candidates.push({ value: email, source: "json-ld" });
  }

  const microdata = microdataValue(html, "email");
  if (microdata) candidates.push({ value: microdata, source: "microdata" });

  const mailtoPattern = /<a\b[^>]*\bhref\s*=\s*["']mailto:([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoPattern.exec(html)) !== null) {
    const decoded = decodeEntities(match[1]).split("?")[0];
    if (decoded) candidates.push({ value: decoded, source: "links" });
  }

  return candidates;
}

function pickEmail(
  html: string,
  orgNodes: Record<string, unknown>[],
  baseHost: string,
): { value: string; source: FieldSource } | null {
  const valid: { value: string; source: FieldSource }[] = [];
  for (const candidate of collectEmailCandidates(html, orgNodes)) {
    const email = candidate.value
      .trim()
      .toLowerCase()
      .replace(/^mailto:/, "");
    if (!isValidEmail(email)) continue;
    if (isRejectedEmail(email)) continue;
    valid.push({ value: email, source: candidate.source });
  }

  const ownDomain = valid.filter((candidate) =>
    isOwnDomain(candidate.value, baseHost),
  );
  return ownDomain[0] ?? valid[0] ?? null;
}

function pickPhone(
  html: string,
  orgNodes: Record<string, unknown>[],
): { value: string; source: FieldSource } | null {
  for (const node of orgNodes) {
    const telephone = node["telephone"];
    if (Array.isArray(telephone)) {
      for (const item of telephone) {
        const filtered = filterPhone(asText(item));
        if (filtered) return { value: filtered, source: "json-ld" };
      }
    } else {
      const filtered = filterPhone(asText(telephone));
      if (filtered) return { value: filtered, source: "json-ld" };
    }
  }

  const microdata = filterPhone(microdataValue(html, "telephone"));
  if (microdata) return { value: microdata, source: "microdata" };

  const telPattern = /<a\b[^>]*\bhref\s*=\s*["']tel:([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = telPattern.exec(html)) !== null) {
    const filtered = filterPhone(decodeEntities(match[1]));
    if (filtered) return { value: filtered, source: "links" };
  }

  const text = extractPhoneFromText(visibleText(html));
  if (text) return { value: text, source: "text" };

  return null;
}

type MutableFields = Partial<Record<ClientFieldKey, CompanyField>>;

function addField(
  fields: MutableFields,
  key: ClientFieldKey,
  value: string,
  source: FieldSource,
  confidence: Confidence,
): void {
  if (fields[key] !== undefined) return;
  if (!value) return;
  fields[key] = { value, source, confidence };
}

/** Separa logradouro e número pela heurística do §5.2. */
function splitStreetAddress(value: string): {
  street: string;
  streetNumber: string;
} {
  const trimmed = value.trim();
  const match = /^(.*?)[,\s]+(\d+\s*[A-Za-z]?)$/.exec(trimmed);
  if (!match) return { street: trimmed, streetNumber: "" };
  return { street: match[1].trim(), streetNumber: match[2].trim() };
}

function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? formatCep(digits) : "";
}

function formatState(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

function formatCountry(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === "BR" || /^brazil$/i.test(trimmed))
    return "Brasil";
  return trimmed;
}

type AddressMap = Partial<
  Record<
    | "postalCode"
    | "streetAddress"
    | "addressLocality"
    | "addressRegion"
    | "addressCountry",
    string
  >
>;

function readAddressFields(node: Record<string, unknown>): AddressMap {
  const address = firstAddressObject(node["address"]);
  if (!address) return {};

  const get = (key: string): string => {
    const value = address[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = asText(item);
        if (text) return text;
      }
      return "";
    }
    return asText(value);
  };

  return {
    postalCode: get("postalCode"),
    streetAddress: get("streetAddress"),
    addressLocality: get("addressLocality"),
    addressRegion: get("addressRegion"),
    addressCountry: get("addressCountry"),
  };
}

export function extractCompanyProfile(
  html: string,
  baseUrl: string,
): CompanyProfile {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return { fields: {} };
  }

  const baseHost = base.hostname.toLowerCase().replace(/^www\./i, "");
  const orgNodes = organizationNodes(html);
  const fields: MutableFields = {};

  for (const node of orgNodes) {
    const companyName = asText(node["legalName"]) || asText(node["name"]);
    addField(fields, "company_name", companyName, "json-ld", "high");

    const tradeName = firstText(node, "alternateName");
    addField(fields, "trade_name", tradeName, "json-ld", "medium");

    for (const identifier of identifierValues(node)) {
      if (isValidCnpj(identifier)) {
        addField(fields, "tax_id", formatCnpj(identifier), "json-ld", "high");
        break;
      }
    }

    const address = readAddressFields(node);
    addField(
      fields,
      "postal_code",
      formatPostalCode(address.postalCode ?? ""),
      "json-ld",
      "high",
    );
    addField(fields, "city", address.addressLocality ?? "", "json-ld", "high");
    addField(
      fields,
      "state",
      formatState(address.addressRegion ?? ""),
      "json-ld",
      "high",
    );
    addField(
      fields,
      "country",
      formatCountry(address.addressCountry ?? ""),
      "json-ld",
      "high",
    );

    if (address.streetAddress) {
      const split = splitStreetAddress(address.streetAddress);
      addField(fields, "street", split.street, "json-ld", "medium");
      addField(
        fields,
        "street_number",
        split.streetNumber,
        "json-ld",
        "medium",
      );
    }
  }

  if (fields["company_name"] === undefined) {
    addField(fields, "company_name", ogSiteName(html), "opengraph", "medium");
  }

  if (fields["company_name"] === undefined) {
    const microdataName = microdataOrganizationName(html);
    if (microdataName) {
      addField(fields, "company_name", microdataName, "microdata", "medium");
    }
  }

  if (fields["tax_id"] === undefined) {
    const cnpj = extractCnpjFromText(visibleText(html));
    if (cnpj) addField(fields, "tax_id", cnpj, "text", "medium");
  }

  const phone = pickPhone(html, orgNodes);
  if (phone)
    addField(
      fields,
      "phone",
      phone.value,
      phone.source,
      phone.source === "json-ld"
        ? "high"
        : phone.source === "text"
          ? "low"
          : "medium",
    );

  const email = pickEmail(html, orgNodes, baseHost);
  if (email) {
    addField(
      fields,
      "email",
      email.value,
      email.source,
      email.source === "json-ld" ? "high" : "medium",
    );
  }

  if (fields["postal_code"] === undefined) {
    addField(
      fields,
      "postal_code",
      formatPostalCode(microdataValue(html, "postalCode")),
      "microdata",
      "medium",
    );
  }
  if (fields["city"] === undefined) {
    addField(
      fields,
      "city",
      microdataValue(html, "addressLocality"),
      "microdata",
      "medium",
    );
  }
  if (fields["state"] === undefined) {
    addField(
      fields,
      "state",
      formatState(microdataValue(html, "addressRegion")),
      "microdata",
      "medium",
    );
  }
  if (fields["country"] === undefined) {
    addField(
      fields,
      "country",
      formatCountry(microdataValue(html, "addressCountry")),
      "microdata",
      "medium",
    );
  }
  if (fields["street"] === undefined) {
    const streetAddress = microdataValue(html, "streetAddress");
    if (streetAddress) {
      const split = splitStreetAddress(streetAddress);
      addField(fields, "street", split.street, "microdata", "medium");
      addField(
        fields,
        "street_number",
        split.streetNumber,
        "microdata",
        "medium",
      );
    }
  }

  return { fields };
}
