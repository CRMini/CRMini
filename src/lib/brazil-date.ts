export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getBrazilDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatBrazilDate(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const dateOnly = dateOnlyPattern.exec(String(value));

  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  const date = new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}

export function formatBrazilDateMedium(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatBrazilDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function toCivilDateTimeInput(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
