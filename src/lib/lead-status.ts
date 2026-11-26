export const LEAD_STATUSES = [
  "Novo",
  "Em contato",
  "Qualificando",
  "Qualificado",
  "Reunião agendada",
  "Desqualificado",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_DISQUALIFICATION_REASONS = [
  "Orçamento",
  "Prazo",
  "Sem Resposta",
  "Fechado com o Concorrente",
  "Optou por Solução Interna",
  "Sem Capacidade de Entrega",
  "Dados Inválidos",
] as const;

export type LeadDisqualificationReason =
  (typeof LEAD_DISQUALIFICATION_REASONS)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadDisqualificationReason(
  value: string,
): value is LeadDisqualificationReason {
  return (LEAD_DISQUALIFICATION_REASONS as readonly string[]).includes(value);
}

/**
 * Transições manuais permitidas. `Qualificado` não aparece como destino: ele é
 * consequência da conversão (D-04), não uma escolha do usuário. `Qualificado` e
 * `Desqualificado` são terminais (spec §5).
 */
const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  Novo: ["Em contato", "Qualificando", "Reunião agendada", "Desqualificado"],
  "Em contato": ["Novo", "Qualificando", "Reunião agendada", "Desqualificado"],
  Qualificando: ["Em contato", "Reunião agendada", "Desqualificado"],
  "Reunião agendada": ["Em contato", "Qualificando", "Desqualificado"],
  Qualificado: [],
  Desqualificado: [],
};

export function canTransitionLeadStatus(
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedLeadStatusTransitions(from: LeadStatus): LeadStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}
