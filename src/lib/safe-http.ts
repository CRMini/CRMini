/**
 * Transporte HTTP com guarda de SSRF e limites de tempo/tamanho. Destinado ao
 * runtime do servidor (`node:dns`); a validação pura está em `safe-url`.
 *
 * Exemplo de uso por outra feature:
 *
 * ```ts
 * const deadline = startDeadline(20_000);
 * const { response, url } = await fetchGuarded(target, {
 *   accept: "text/html",
 *   deadline,
 * });
 * if (!response.ok) {
 *   await discardBody(response);
 *   // tratar status de erro
 * }
 * const { bytes, truncated } = await readLimitedBody(response, 512 * 1024);
 * ```
 *
 * Limitações conhecidas: o DNS é resolvido separadamente do `fetch`, então há
 * uma janela residual de DNS rebinding (TOCTOU). O `AbortSignal.timeout` de cada
 * requisição também aborta a leitura do corpo, mas o prazo entre requisições
 * deve ser passado em `deadline`.
 */
import { promises as dns } from "node:dns";
import { isAllowedTarget, isBlockedAddress } from "@/lib/safe-url";

const defaultRequestTimeoutMs = 5000;
const defaultMaxRedirects = 3;
const defaultUserAgent = "CRMini/1.0";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export class InvalidTargetError extends Error {
  override name = "InvalidTargetError";
}
export class BlockedAddressError extends Error {
  override name = "BlockedAddressError";
}
export class DeadlineExceededError extends Error {
  override name = "DeadlineExceededError";
}

export type GuardedResponse = { response: Response; url: URL };

export type FetchGuardedOptions = {
  accept: string;
  deadline: number;
  requestTimeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
};

export function startDeadline(totalMs: number): number {
  return Date.now() + totalMs;
}

/** Revalida o destino antes de cada requisição (inclusive após redirects). */
export async function assertPublicTarget(url: URL): Promise<void> {
  if (!isAllowedTarget(url)) throw new InvalidTargetError();

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(hostname, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedAddress(address))
  ) {
    throw new BlockedAddressError();
  }
}

/** Falha ao atingir o prazo total da requisição, nunca além de 5 s por fetch. */
function assertWithinDeadline(deadline: number): void {
  if (Date.now() >= deadline) throw new DeadlineExceededError();
}

function timeoutFor(deadline: number, requestTimeoutMs: number): number {
  return Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now()));
}

export async function discardBody(response: Response): Promise<void> {
  if (response.body) await response.body.cancel().catch(() => {});
}

export function exceedsDeclaredSize(
  response: Response,
  limit: number,
): boolean {
  const declared = Number(response.headers.get("content-length"));
  return Number.isFinite(declared) && declared > limit;
}

export async function readLimitedBody(
  response: Response,
  limit: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const body = response.body;
  if (!body) return { bytes: new Uint8Array(), truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      const remaining = limit - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        total = limit;
        truncated = true;
        break;
      }

      chunks.push(value);
      total += value.byteLength;

      if (total === limit) {
        // Confirma se o corpo continua além do limite já lido.
        const next = await reader.read();
        if (!next.done) truncated = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

export async function fetchGuarded(
  target: URL,
  {
    accept,
    deadline,
    requestTimeoutMs = defaultRequestTimeoutMs,
    maxRedirects = defaultMaxRedirects,
    userAgent = defaultUserAgent,
  }: FetchGuardedOptions,
): Promise<GuardedResponse> {
  let current = new URL(target.href);

  for (let redirects = 0; ; redirects += 1) {
    assertWithinDeadline(deadline);
    await assertPublicTarget(current);
    assertWithinDeadline(deadline);

    const response = await fetch(current.href, {
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": userAgent, Accept: accept },
      signal: AbortSignal.timeout(timeoutFor(deadline, requestTimeoutMs)),
    });

    if (redirectStatuses.has(response.status)) {
      const location = response.headers.get("location");
      await discardBody(response);
      if (!location || redirects >= maxRedirects)
        throw new InvalidTargetError();

      try {
        current = new URL(location, current);
      } catch {
        throw new InvalidTargetError();
      }
      continue;
    }

    return { response, url: current };
  }
}
