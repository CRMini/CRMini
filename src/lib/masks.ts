const nonAlphanumeric = /[^0-9A-Za-z]/g;
const nonDigits = /\D/g;
const alphanumericCharacter = /^[0-9A-Za-z]$/;
const digitCharacter = /^\d$/;
const maxCnpjLength = 14;
const maxCepDigits = 8;
// Apenas as 12 primeiras posições aceitam letras; as duas últimas são dígitos.
const firstCnpjDigitPosition = 12;
const completeCnpjShape = /^[0-9A-Z]{12}\d{2}$/;
// Caracteres aceitos ao exibir CNPJ. Qualquer outro indica texto livre
// (por exemplo, "CNPJ pendente (antigo)") que não deve ser reescrito.
const unsupportedCnpjCharacters = /[^0-9A-Za-z./\s-]/;
// Caracteres aceitos ao exibir CEP. Letras, dois-pontos, barras e parênteses
// indicam valor legado ou texto livre e também não devem ser reescritos.
const unsupportedCepCharacters = /[^0-9.\s-]/;

function onlyAlphanumeric(value: string): string {
  return value.replace(nonAlphanumeric, "");
}

function onlyDigits(value: string): string {
  return value.replace(nonDigits, "");
}

/**
 * Formata o CNPJ durante a digitação, com separadores progressivos
 * ("00.000.000/0000-00"). Aceita o formato alfanumérico (letras de A a Z)
 * apenas nas 12 primeiras posições, converte as letras para maiúsculas e
 * limita a 14 caracteres. As duas últimas posições (dígitos verificadores)
 * aceitam somente números; letras digitadas nelas são descartadas.
 */
export function formatCnpj(value: string | null | undefined): string {
  const text = typeof value === "string" ? value : "";
  const characters: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);

    if (!alphanumericCharacter.test(character)) {
      continue;
    }

    const upperCharacter = character.toUpperCase();

    if (
      characters.length >= firstCnpjDigitPosition &&
      !digitCharacter.test(upperCharacter)
    ) {
      continue;
    }

    characters.push(upperCharacter);

    if (characters.length === maxCnpjLength) {
      break;
    }
  }

  if (!characters.length) {
    return "";
  }

  let masked = "";

  for (let index = 0; index < characters.length; index += 1) {
    if (index === 2 || index === 5) {
      masked += ".";
    } else if (index === 8) {
      masked += "/";
    } else if (index === 12) {
      masked += "-";
    }

    masked += characters[index];
  }

  return masked;
}

/**
 * Aplica a máscara apenas a CNPJs completos e inequívocos. O valor é
 * preservado, sem espaços nas extremidades, quando contém caracteres fora do
 * conjunto aceito (parênteses, dois-pontos, letras acentuadas etc.) ou quando,
 * após remover separadores, não corresponde a 12 caracteres alfanuméricos
 * seguidos de 2 dígitos. Assim, dados legados e texto livre não são reescritos.
 */
export function formatCnpjForDisplay(value: string | null | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return "";
  }

  if (unsupportedCnpjCharacters.test(text)) {
    return text;
  }

  const characters = onlyAlphanumeric(text).toUpperCase();

  return completeCnpjShape.test(characters) ? formatCnpj(characters) : text;
}

/**
 * Formata o CEP durante a digitação: apenas dígitos, limitado a 8, com hífen
 * após o quinto dígito ("00000-000").
 */
export function formatCep(value: string | null | undefined): string {
  const text = typeof value === "string" ? value : "";
  const digits = onlyDigits(text).slice(0, maxCepDigits);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Aplica a máscara apenas a CEPs completos e inequívocos. O valor é preservado,
 * sem espaços nas extremidades, quando contém caracteres fora do conjunto
 * aceito (letras, dois-pontos, barras, parênteses etc.) ou quando não possui
 * exatamente 8 dígitos. Assim, dados legados e texto livre não são reescritos.
 */
export function formatCepForDisplay(value: string | null | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return "";
  }

  if (unsupportedCepCharacters.test(text)) {
    return text;
  }

  return onlyDigits(text).length === maxCepDigits ? formatCep(text) : text;
}
