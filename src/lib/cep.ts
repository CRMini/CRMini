import { formatCep } from "@/lib/masks";

const cepLength = 8;

/** Mantém apenas os dígitos do CEP informado. */
export function normalizeCep(value: string | null | undefined): string {
  const text = typeof value === "string" ? value : "";
  return text.replace(/\D/g, "");
}

/** Um CEP consultável tem exatamente 8 dígitos, com ou sem máscara. */
export function isValidCep(value: string | null | undefined): boolean {
  return normalizeCep(value).length === cepLength;
}

export type CepAddress = {
  postal_code: string;
  street: string;
  city: string;
  state: string;
};

/**
 * Converte a resposta do ViaCEP no endereço usado pelo CRM.
 * Retorna `null` quando o CEP não foi encontrado ou a resposta é inválida.
 */
export function parseViaCepPayload(
  payload: unknown,
  cep: string,
): CepAddress | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.erro === true) {
    return null;
  }

  const city =
    typeof record.localidade === "string" ? record.localidade.trim() : "";
  const state = typeof record.uf === "string" ? record.uf.trim() : "";

  if (!city || !state) {
    return null;
  }

  return {
    postal_code: formatCep(cep),
    street:
      typeof record.logradouro === "string" ? record.logradouro.trim() : "",
    city,
    state,
  };
}
