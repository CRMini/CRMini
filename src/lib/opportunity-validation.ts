/** Regras de oportunidade compartilhadas entre a criação direta e a conversão. */

export const OPPORTUNITY_STATUSES = [
  "Em andamento",
  "Desenvolvimento",
  "Proposta",
  "Aceite da proposta",
  "Ganha",
  "Perdida",
] as const;

export const OPPORTUNITY_LOSS_REASONS = [
  "Preço",
  "Prazo",
  "Tecnologia",
  "Solução",
] as const;

export const OPPORTUNITY_CURRENCIES = ["BRL", "USD", "EUR", "PES"] as const;

/**
 * Valida os campos da oportunidade, exceto `client_id` e `contact_id`, que são
 * resolvidos de formas diferentes na criação direta e na conversão do lead.
 */
export function validateOpportunityFields(
  body: Record<string, unknown>,
): string | null {
  if (typeof body.name !== "string" || !body.name.trim())
    return "Informe o nome da oportunidade.";
  if (
    !(OPPORTUNITY_STATUSES as readonly string[]).includes(
      String(body.status ?? "Em andamento"),
    )
  )
    return "Status inválido.";
  if (
    body.status === "Perdida"
      ? !(OPPORTUNITY_LOSS_REASONS as readonly string[]).includes(
          String(body.loss_reason),
        )
      : body.loss_reason != null && body.loss_reason !== ""
  )
    return "Informe um motivo apenas para oportunidades perdidas.";
  for (const key of ["value", "budget", "project_hours"] as const)
    if (
      body[key] != null &&
      body[key] !== "" &&
      (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)
    )
      return `O campo ${key} deve ser um número não negativo.`;
  if (
    body.currency != null &&
    !(OPPORTUNITY_CURRENCIES as readonly string[]).includes(
      String(body.currency),
    )
  )
    return "Moeda inválida.";
  if (
    body.budget_currency != null &&
    body.budget_currency !== "" &&
    !(OPPORTUNITY_CURRENCIES as readonly string[]).includes(
      String(body.budget_currency),
    )
  )
    return "Moeda do budget inválida.";
  return null;
}
