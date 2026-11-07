import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared metric / imperial helpers for Health UI (#109 form, #110 charts).
 * API payloads stay metric-only (cm, kg). Convert on the client for display
 * and for imperial form input before POST.
 */

export type UnitSystem = 'metric' | 'imperial';

/** Single preference key for Health unit mode. Do not invent a second key. */
export const HEALTH_UNIT_PREFERENCE_KEY = 'health_unit_preference';

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

/** Round to one decimal for display and stable toggle round-trips. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(cm);
  const feet = Math.floor(totalInches / 12);
  const inches = round1(totalInches - feet * 12);
  if (inches >= 12) {
    return { feet: feet + 1, inches: round1(inches - 12) };
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * 12 + inches);
}

/**
 * BMI from metric height and weight.
 * Formula stays metric even when the UI shows imperial.
 */
export function computeBmi(heightCm: number, weightKg: number): number | null {
  if (!(heightCm > 0) || !(weightKg > 0)) {
    return null;
  }
  const heightM = heightCm / 100;
  return round1(weightKg / (heightM * heightM));
}

export function displayWeightKg(weightKg: number, unit: UnitSystem): number {
  return unit === 'imperial' ? round1(kgToLb(weightKg)) : round1(weightKg);
}

export function displayHeightCm(heightCm: number, unit: UnitSystem): number {
  return unit === 'imperial' ? round1(cmToInches(heightCm)) : round1(heightCm);
}

export function weightUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'lb' : 'kg';
}

export function heightUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'in' : 'cm';
}

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === 'metric' || value === 'imperial';
}

/** Regions that default to imperial when no saved preference exists (#147). */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

/**
 * Resolve the runtime locale tag.
 * Prefer `navigator.language` (web / Expo web). Fall back to `Intl`.
 */
export function resolveRuntimeLocale(): string {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.language === 'string' &&
      navigator.language.trim() !== ''
    ) {
      return navigator.language;
    }
  } catch {
    // Ignore and try Intl.
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof locale === 'string' && locale.trim() !== '') {
      return locale;
    }
  } catch {
    // Fall through.
  }
  return '';
}

/**
 * Extract a BCP 47 region subtag (uppercase), or null when missing / invalid.
 */
export function regionFromLocale(locale: string | null | undefined): string | null {
  if (locale == null || typeof locale !== 'string') {
    return null;
  }
  const trimmed = locale.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    const region = new Intl.Locale(trimmed).region;
    if (typeof region === 'string' && region.trim() !== '') {
      return region.toUpperCase();
    }
    return null;
  } catch {
    // Fallback when Intl.Locale rejects the tag (e.g. underscores only).
    const parts = trimmed.replace(/_/g, '-').split('-');
    for (let i = parts.length - 1; i >= 1; i -= 1) {
      const part = parts[i];
      if (/^[A-Za-z]{2}$/.test(part)) {
        return part.toUpperCase();
      }
    }
    return null;
  }
}

/**
 * Initial unit mode from locale region.
 * Imperial only for US, LR, MM. Metric when region is missing or other.
 * Omit `locale` to use the runtime locale; pass null/empty for metric.
 */
export function defaultUnitSystemFromLocale(
  locale: string | null | undefined = resolveRuntimeLocale()
): UnitSystem {
  const region = regionFromLocale(locale ?? '');
  if (region != null && IMPERIAL_REGIONS.has(region)) {
    return 'imperial';
  }
  return 'metric';
}

/**
 * Load saved unit preference, or locale default when none is stored.
 * Does not write the locale default; only an explicit toggle persists.
 */
export async function loadUnitPreference(): Promise<UnitSystem> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_UNIT_PREFERENCE_KEY);
    if (isUnitSystem(raw)) {
      return raw;
    }
  } catch {
    // Fall through to locale default.
  }
  return defaultUnitSystemFromLocale();
}

export async function saveUnitPreference(unit: UnitSystem): Promise<void> {
  await AsyncStorage.setItem(HEALTH_UNIT_PREFERENCE_KEY, unit);
}

/** Format weight from stored kg for the active unit system. */
export function formatWeightDisplay(
  weightKg: number | null | undefined,
  system: UnitSystem
): string | null {
  if (weightKg == null || !Number.isFinite(weightKg)) {
    return null;
  }
  if (system === 'imperial') {
    return `${round1(kgToLb(weightKg))} lb`;
  }
  return `${round1(weightKg)} kg`;
}

/** Format height from stored cm for the active unit system. */
export function formatHeightDisplay(
  heightCm: number | null | undefined,
  system: UnitSystem
): string | null {
  if (heightCm == null || !Number.isFinite(heightCm)) {
    return null;
  }
  if (system === 'imperial') {
    const { feet, inches } = cmToFeetInches(heightCm);
    return `${feet} ft ${inches} in`;
  }
  return `${round1(heightCm)} cm`;
}
