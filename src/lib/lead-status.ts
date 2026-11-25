export const LEAD_STATUSES = [
  "Novo",
  "Em contato",
  "Qualificando",
  "Qualificado",
  "Reunião agendada",
  "Desqualificado",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
