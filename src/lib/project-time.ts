const hoursPerUnit = Object.freeze({
  hours: 1,
  days: 8,
  weeks: 40,
  months: 160,
});

export type ProjectTimeUnit = keyof typeof hoursPerUnit;
export type ProjectTimeValue = number | string | null | undefined;

export function toProjectHours(
  value: ProjectTimeValue,
  unit: ProjectTimeUnit,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Duração inválida.");
  }

  return amount * hoursPerUnit[unit];
}
