import { resolveRuntimeLocale } from '@/lib/health/units';

/**
 * Shared locale display helpers for manager lists and read-only views (#202).
 *
 * Rule: locale follows the device/browser (`navigator.language`, then `Intl`).
 * Pass an explicit locale in tests. Wire values stay `YYYY-MM-DD` / cents for
 * the API; these helpers are display-only.
 *
 * ```text
 * Wire ISO / cents
 *   --> formatDisplayDate / formatUsdFromCents / formatDisplayInteger
 *   --> manager list / read-only form text
 * ```
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Shared empty marker for missing dates and numbers in manager UI. */
export const DISPLAY_EMPTY = '—';

/**
 * Locale tag for display formatters.
 * Omit or pass null/empty to follow the device/browser.
 */
export function resolveDisplayLocale(
  locale?: string | null
): string | undefined {
  if (locale != null && locale.trim() !== '') {
    return locale.trim();
  }
  const runtime = resolveRuntimeLocale();
  return runtime.trim() !== '' ? runtime : undefined;
}

/**
 * Parse a wire date for local calendar display.
 * Date-only `YYYY-MM-DD` uses local Y/M/D (no UTC day shift).
 * ISO datetimes use `Date` parse.
 */
export function parseWireDate(
  value: string | null | undefined
): Date | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
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
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Format a wire date (`YYYY-MM-DD` or ISO datetime) for display.
 * Null / blank / invalid → `DISPLAY_EMPTY` (em dash).
 */
export function formatDisplayDate(
  value: string | null | undefined,
  locale?: string | null
): string {
  if (value == null || value.trim() === '') {
    return DISPLAY_EMPTY;
  }
  const parsed = parseWireDate(value);
  if (parsed == null) {
    return DISPLAY_EMPTY;
  }
  return parsed.toLocaleDateString(resolveDisplayLocale(locale));
}

/**
 * Format API `cost_cents` as a USD-style amount for display.
 * Null / non-finite → null (callers use `DISPLAY_EMPTY`).
 */
export function formatUsdFromCents(
  costCents: number | null | undefined,
  locale?: string | null
): string | null {
  if (costCents == null || !Number.isFinite(costCents)) {
    return null;
  }
  const dollars = costCents / 100;
  return new Intl.NumberFormat(resolveDisplayLocale(locale), {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

/**
 * Format an integer for display (locale grouping).
 * Null / non-finite → null (callers use `DISPLAY_EMPTY`).
 */
export function formatDisplayInteger(
  value: number | null | undefined,
  locale?: string | null
): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return new Intl.NumberFormat(resolveDisplayLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}
