/**
 * Shared health unit conversion helpers (metric ↔ imperial).
 *
 * Stable API for Health Manager UI and charts (#110). Keep export names and
 * rounding rules unless a story updates both call sites.
 *
 * Contract:
 * - API / storage always use metric field names: `weight_kg`, `height_cm`.
 * - Imperial height uses feet + inches (not total inches alone).
 * - Rounding: kg and lb to 1 decimal; cm to 1 decimal; inches to 1 decimal.
 * - Display always converts FROM stored metric (source of truth) so a unit
 *   toggle does not accumulate drift.
 *
 * Exports:
 * - `UnitSystem`, `FeetInches`
 * - `roundToDecimals`
 * - `kgToLb` / `lbToKg`
 * - `cmToFeetInches` / `feetInchesToCm`
 * - `formatWeightDisplay` / `formatHeightDisplay`
 */

export type UnitSystem = 'metric' | 'imperial';

export type FeetInches = {
  feet: number;
  inches: number;
};

/** Pounds per kilogram (exact international avoirdupois). */
export const LB_PER_KG = 2.2046226218;

/** Centimetres per inch. */
export const CM_PER_IN = 2.54;

const IN_PER_FT = 12;

export function roundToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Convert stored kilograms to display pounds (1 decimal). */
export function kgToLb(kg: number): number {
  return roundToDecimals(kg * LB_PER_KG, 1);
}

/** Convert entered pounds to API kilograms (1 decimal). */
export function lbToKg(lb: number): number {
  return roundToDecimals(lb / LB_PER_KG, 1);
}

/**
 * Convert stored centimetres to feet + inches.
 * Inches are rounded to 1 decimal; whole feet come from total inches.
 */
export function cmToFeetInches(cm: number): FeetInches {
  const totalInches = roundToDecimals(cm / CM_PER_IN, 1);
  let feet = Math.floor(totalInches / IN_PER_FT);
  let inches = roundToDecimals(totalInches - feet * IN_PER_FT, 1);
  if (inches >= IN_PER_FT) {
    feet += 1;
    inches = roundToDecimals(inches - IN_PER_FT, 1);
  }
  return { feet, inches };
}

/** Convert entered feet + inches to API centimetres (1 decimal). */
export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * IN_PER_FT + inches;
  return roundToDecimals(totalInches * CM_PER_IN, 1);
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
    return `${kgToLb(weightKg)} lb`;
  }
  return `${roundToDecimals(weightKg, 1)} kg`;
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
  return `${roundToDecimals(heightCm, 1)} cm`;
}
