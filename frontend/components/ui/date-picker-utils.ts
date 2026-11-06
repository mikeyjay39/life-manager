const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD into a local calendar Date, or null when invalid. */
export function parseYmdToLocalDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!YMD_PATTERN.test(trimmed)) {
    return null;
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const local = new Date(year, month - 1, day);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    return null;
  }
  return local;
}

/** Formats a local Date as YYYY-MM-DD for form state and the API date slice. */
export function formatLocalDateToYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
