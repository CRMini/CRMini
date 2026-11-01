import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export type JsonBodyResult<T> =
  { ok: true; body: T } | { ok: false; response: NextResponse };

type JsonBodyOptions = {
  /** Mensagem para JSON malformado. Default: "Corpo JSON inválido.". */
  error?: string;
  /** Mensagem para JSON válido que não é objeto. Default: igual a `error`. */
  shapeError?: string;
  status?: number;
};

function invalidBody(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Lê o corpo da requisição como objeto JSON e padroniza o 400, evitando que
 * JSON malformado ou corpo não-objeto vire um 500. `error` cobre o parse e
 * `shapeError` o formato, para rotas preservarem mensagens de validação próprias.
 */
export async function readJsonObject<
  T extends Record<string, unknown> = Record<string, unknown>,
>(request: NextRequest, options?: JsonBodyOptions): Promise<JsonBodyResult<T>> {
  const status = options?.status ?? 400;
  const parseError = options?.error ?? "Corpo JSON inválido.";

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, response: invalidBody(parseError, status) };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: invalidBody(options?.shapeError ?? parseError, status),
    };
  }

  return { ok: true, body: parsed as T };
}
