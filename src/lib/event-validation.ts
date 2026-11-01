import { getBrazilDateString } from "@/lib/brazil-date";

export const eventTypes = [
  "reuniao",
  "ligacao",
  "email",
  "mensagem",
  "nota",
] as const;
export type EventType = (typeof eventTypes)[number];

const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !civilDatePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

export function validateEvent(body: Record<string, unknown>): string | null {
  const eventType =
    body.event_type == null || body.event_type === ""
      ? "nota"
      : body.event_type;

  if (
    typeof eventType !== "string" ||
    !eventTypes.includes(eventType as EventType)
  ) {
    return "Tipo de evento inválido.";
  }

  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 200
  ) {
    return "Informe um título (até 200 caracteres).";
  }

  if (body.details != null && typeof body.details !== "string") {
    return "Detalhes inválidos.";
  }

  if (typeof body.details === "string" && body.details.length > 5000) {
    return "Detalhes muito longos.";
  }

  if (typeof body.client_id !== "string" || !body.client_id.trim()) {
    return "Informe o cliente.";
  }

  if (!isValidCivilDate(body.occurred_at)) {
    return "Informe uma data válida.";
  }

  if (body.occurred_at > getBrazilDateString()) {
    return "A data do evento não pode ser futura.";
  }

  if (
    body.contact_id != null &&
    body.contact_id !== "" &&
    typeof body.contact_id !== "string"
  ) {
    return "Contato inválido.";
  }

  if (
    body.opportunity_id != null &&
    body.opportunity_id !== "" &&
    typeof body.opportunity_id !== "string"
  ) {
    return "Oportunidade inválida.";
  }

  return null;
}
