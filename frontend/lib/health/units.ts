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

export async function loadUnitPreference(): Promise<UnitSystem> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_UNIT_PREFERENCE_KEY);
    if (isUnitSystem(raw)) {
      return raw;
    }
  } catch {
    // Fall through to default.
  }
  return 'metric';
}

export async function saveUnitPreference(unit: UnitSystem): Promise<void> {
  await AsyncStorage.setItem(HEALTH_UNIT_PREFERENCE_KEY, unit);
}
