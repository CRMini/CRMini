const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida um endereço de e-mail com a regra usada nas importações. */
export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return EMAIL_PATTERN.test(value);
}
