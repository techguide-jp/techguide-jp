const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" 形式かつ実在する日付なら正規化した文字列を返す。 */
export const normalizeDateInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
};
