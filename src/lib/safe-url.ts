/**
 * Utilitários puros (sem I/O) para validar URLs e classificar endereços de
 * destinos consultados pelo servidor.
 */

const defaultProtocol = "https://";

/** Valida e normaliza a URL informada, devolvendo `null` quando não é consultável. */
export function normalizeHttpUrl(input: string): string | null {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${defaultProtocol}${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;

  return url.href;
}

/** Destinos aceitos: http(s), sem credenciais e em porta padrão. */
export function isAllowedTarget(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  return url.port === "" || url.port === "80" || url.port === "443";
}

/**
 * Normaliza a URL e devolve `null` quando o destino não pode ser consultado.
 * Valida apenas esquema, credenciais e porta; não resolve DNS. Antes de buscar,
 * combine com `assertPublicTarget` de `@/lib/safe-http`.
 */
export function toPublicTarget(input: string): URL | null {
  const normalized = normalizeHttpUrl(input);
  if (!normalized) return null;

  const url = new URL(normalized);
  return isAllowedTarget(url) ? url : null;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** Converte um IPv6 (inclusive comprimido e com IPv4 embutido) em 16 bytes. */
function parseIpv6(address: string): number[] | null {
  const text = address.split("%")[0].toLowerCase();
  if (!text || !/^[0-9a-f:.]+$/.test(text)) return null;

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      if (piece.includes(".")) {
        const ipv4 = parseIpv4(piece);
        if (!ipv4) return null;
        groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
        groups.push(Number.parseInt(piece, 16));
      }
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!head || !tail) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  return groups.flatMap((group) => [(group >> 8) & 0xff, group & 0xff]);
}

function isBlockedIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

function isBlockedIpv6(bytes: number[]): boolean {
  if (bytes.every((byte) => byte === 0)) return true;
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1)
    return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  const embeddedIpv4Blocked = (start: number) =>
    isBlockedIpv4(bytes.slice(start, start + 4));

  const mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (mapped) return embeddedIpv4Blocked(12);

  // IPv4-compatível (::/96) e NAT64 (64:ff9b::/96) carregam o IPv4 no fim.
  const compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  if (compatible) return embeddedIpv4Blocked(12);

  const nat64 =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0);
  if (nat64) return embeddedIpv4Blocked(12);

  // 6to4 (2002::/16) carrega o IPv4 nos bytes 2-5.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return embeddedIpv4Blocked(2);

  return false;
}

/**
 * Bloqueia destinos internos. Recursos consultam URLs sugeridas pelo usuário,
 * então é preciso evitar SSRF contra loopback, rede privada, metadados de nuvem
 * e IPv4 embutido em IPv6 (mapeado, compatível, NAT64 e 6to4).
 */
export function isBlockedAddress(address: string): boolean {
  const value = address
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (!value) return true;

  const ipv4 = parseIpv4(value);
  if (ipv4) return isBlockedIpv4(ipv4);

  const ipv6 = parseIpv6(value);
  if (ipv6) return isBlockedIpv6(ipv6);

  // Formato desconhecido: falha fechada, pois não dá para garantir que é público.
  return true;
}
