import type { CreateHealthReadingCommand } from '@/lib/api/types';
import {
  feetInchesToCm,
  lbToKg,
  type UnitSystem,
} from '@/lib/health/units';

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const NOTES_MAX_LEN = 2000;

export type HealthReadingFormInput = {
  recordedOn: string;
  heightCm: string;
  weightKg: string;
  heightFeet: string;
  heightInches: string;
  weightLb: string;
  systolic: string;
  diastolic: string;
  heartRate: string;
  notes: string;
};

export type BuildCreateCommandResult =
  | { ok: true; command: CreateHealthReadingCommand }
  | { ok: false; error: string };

function parseOptionalPositiveFloat(
  raw: string,
  fieldLabel: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: `${fieldLabel} must be a positive number.` };
  }
  return { ok: true, value };
}

function parseOptionalPositiveInt(
  raw: string,
  fieldLabel: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${fieldLabel} must be a positive whole number.` };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value <= 0) {
    return { ok: false, error: `${fieldLabel} must be a positive whole number.` };
  }
  return { ok: true, value };
}

function parseRequiredYmd(
  value: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Recorded date is required.' };
  }
  if (!DATE_INPUT_PATTERN.test(trimmed)) {
    return { ok: false, error: 'Recorded date must be in YYYY-MM-DD format.' };
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return { ok: false, error: 'Recorded date must be a valid calendar date.' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validate form input and build a metric-only CreateHealthReadingCommand.
 * Imperial height/weight convert to height_cm / weight_kg before return.
 */
export function buildCreateHealthReadingCommand(
  healthMemberId: string,
  unitSystem: UnitSystem,
  input: HealthReadingFormInput
): BuildCreateCommandResult {
  const recorded = parseRequiredYmd(input.recordedOn);
  if (!recorded.ok) {
    return recorded;
  }

  let height_cm: number | null = null;
  let weight_kg: number | null = null;

  if (unitSystem === 'metric') {
    const height = parseOptionalPositiveFloat(input.heightCm, 'Height');
    if (!height.ok) {
      return height;
    }
    const weight = parseOptionalPositiveFloat(input.weightKg, 'Weight');
    if (!weight.ok) {
      return weight;
    }
    height_cm = height.value;
    weight_kg = weight.value;
  } else {
    const feetRaw = input.heightFeet.trim();
    const inchesRaw = input.heightInches.trim();
    if (feetRaw !== '' || inchesRaw !== '') {
      const feet =
        feetRaw === ''
          ? 0
          : (() => {
              const n = Number(feetRaw);
              return Number.isFinite(n) ? n : NaN;
            })();
      const inches =
        inchesRaw === ''
          ? 0
          : (() => {
              const n = Number(inchesRaw);
              return Number.isFinite(n) ? n : NaN;
            })();
      if (!Number.isFinite(feet) || feet < 0) {
        return { ok: false, error: 'Height (feet) must be a non-negative number.' };
      }
      if (!Number.isFinite(inches) || inches < 0) {
        return {
          ok: false,
          error: 'Height (inches) must be a non-negative number.',
        };
      }
      if (feet === 0 && inches === 0) {
        return { ok: false, error: 'Height must be greater than zero.' };
      }
      if (inches >= 12) {
        return {
          ok: false,
          error: 'Height inches must be less than 12 (use feet for larger values).',
        };
      }
      height_cm = feetInchesToCm(feet, inches);
    }

    const weight = parseOptionalPositiveFloat(input.weightLb, 'Weight');
    if (!weight.ok) {
      return weight;
    }
    weight_kg = weight.value == null ? null : lbToKg(weight.value);
  }

  const systolic = parseOptionalPositiveInt(input.systolic, 'Systolic');
  if (!systolic.ok) {
    return systolic;
  }
  const diastolic = parseOptionalPositiveInt(input.diastolic, 'Diastolic');
  if (!diastolic.ok) {
    return diastolic;
  }
  if (
    (systolic.value != null && diastolic.value == null) ||
    (systolic.value == null && diastolic.value != null)
  ) {
    return {
      ok: false,
      error: 'Enter both systolic and diastolic blood pressure, or leave both blank.',
    };
  }

  const heartRate = parseOptionalPositiveInt(input.heartRate, 'Heart rate');
  if (!heartRate.ok) {
    return heartRate;
  }

  const notesTrimmed = input.notes.trim();
  if ([...notesTrimmed].length > NOTES_MAX_LEN) {
    return {
      ok: false,
      error: `Notes must be at most ${NOTES_MAX_LEN} characters.`,
    };
  }
  const notes = notesTrimmed === '' ? null : notesTrimmed;

  const hasVital =
    height_cm != null ||
    weight_kg != null ||
    systolic.value != null ||
    diastolic.value != null ||
    heartRate.value != null;
  if (!hasVital && notes == null) {
    return {
      ok: false,
      error: 'Enter at least one vital or notes before saving.',
    };
  }

  return {
    ok: true,
    command: {
      health_member_id: healthMemberId,
      recorded_on: recorded.value,
      height_cm,
      weight_kg,
      systolic_mm_hg: systolic.value,
      diastolic_mm_hg: diastolic.value,
      heart_rate_bpm: heartRate.value,
      notes,
    },
  };
}

export function parseHealthReadingDto(item: unknown) {
  const r = item as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    health_member_id: String(r.health_member_id ?? ''),
    recorded_on: String(r.recorded_on ?? ''),
    height_cm: r.height_cm == null ? null : Number(r.height_cm),
    weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
    systolic_mm_hg: r.systolic_mm_hg == null ? null : Number(r.systolic_mm_hg),
    diastolic_mm_hg: r.diastolic_mm_hg == null ? null : Number(r.diastolic_mm_hg),
    heart_rate_bpm: r.heart_rate_bpm == null ? null : Number(r.heart_rate_bpm),
    notes: r.notes != null ? String(r.notes) : null,
    bmi: r.bmi == null ? null : Number(r.bmi),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}
