export const nowIso = (): string => new Date().toISOString();

export const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !isNaN(value.getTime());

export const toIso = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return isValidDate(d) ? d.toISOString() : null;
};
