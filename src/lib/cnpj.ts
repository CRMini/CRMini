/** Validação pura (sem I/O) do CNPJ, incluindo o formato alfanumérico. */

const nonAlphanumeric = /[^0-9A-Za-z]/g;
const cnpjShape = /^[0-9A-Z]{12}\d{2}$/;
const firstCheckDigitWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const secondCheckDigitWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Remove separadores e converte para maiúsculas, mantendo apenas caracteres
 * alfanuméricos. As 12 primeiras posições aceitam letras (IN RFB nº 2.229/2024);
 * as 2 últimas são os dígitos verificadores.
 */
export function normalizeCnpj(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.replace(nonAlphanumeric, "").toUpperCase()
    : "";
}

/**
 * Valor oficial de cada posição: código ASCII do caractere menos 48. Dígito
 * `'0'–'9'` vira `0–9`; letra `'A'–'Z'` vira `17–42` (A=17, B=18, …, Z=42).
 * Não usar o mapeamento alfabético comum (A=10), senão CNPJ com letra é rejeitado.
 */
function checkDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    sum += (base.charCodeAt(index) - 48) * weights[index];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * Aceita apenas CNPJs de 14 caracteres, com as 12 primeiras posições
 * alfanuméricas e as 2 últimas numéricas, e dígitos verificadores corretos.
 * Rejeita também os 14 caracteres idênticos (ex.: `00000000000000`), usados
 * como placeholder em sites.
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  const normalized = normalizeCnpj(value);
  if (!cnpjShape.test(normalized)) return false;
  if (new Set(normalized).size === 1) return false;

  const base = normalized.slice(0, 12);
  if (checkDigit(base, firstCheckDigitWeights) !== Number(normalized[12])) {
    return false;
  }
  return (
    checkDigit(normalized.slice(0, 13), secondCheckDigitWeights) ===
    Number(normalized[13])
  );
}
