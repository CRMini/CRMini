/** Utilitários puros (sem I/O) para descobrir o logo de um site. */

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

function resolveUrl(value: string, base: URL): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Extrai candidatos a logo em ordem de preferência: ícones declarados,
 * apple-touch-icon, og:image e, por último, `/favicon.ico`.
 */
export function extractIconUrls(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const icons: string[] = [];
  const appleIcons: string[] = [];
  const openGraph: string[] = [];

  for (const tag of html.match(/<(?:link|meta)\b[^>]*>/gi) ?? []) {
    const attributes = readAttributes(tag);

    if (/^<link/i.test(tag)) {
      const href = resolveUrl(attributes.href ?? "", base);
      if (!href) continue;

      const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
      if (rel.includes("icon")) icons.push(href);
      else if (rel.some((token) => token.startsWith("apple-touch-icon")))
        appleIcons.push(href);
      continue;
    }

    const property = (
      attributes.property ??
      attributes.name ??
      ""
    ).toLowerCase();
    if (property !== "og:image") continue;

    const content = resolveUrl(attributes.content ?? "", base);
    if (content) openGraph.push(content);
  }

  const fallback = new URL("/favicon.ico", base).href;
  return [...new Set([...icons, ...appleIcons, ...openGraph, fallback])];
}

const isPng = (bytes: Uint8Array) =>
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47;

const isJpeg = (bytes: Uint8Array) =>
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const isWebp = (bytes: Uint8Array) =>
  bytes[0] === 0x52 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x46 &&
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50;

/** Identifica o formato apenas pelos magic bytes; `Content-Type` não é confiável. */
export function sniffImageType(
  bytes: Uint8Array,
): "png" | "jpg" | "webp" | null {
  if (bytes.length >= 4 && isPng(bytes)) return "png";
  if (bytes.length >= 3 && isJpeg(bytes)) return "jpg";
  if (bytes.length >= 12 && isWebp(bytes)) return "webp";
  return null;
}
