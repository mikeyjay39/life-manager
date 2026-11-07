import type {
  CreateHealthReadingCommand,
  HealthReadingDto,
  UpdateHealthReadingCommand,
} from '@/lib/api/types';
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  round1,
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

export type BuildUpdateCommandResult =
  | { ok: true; command: UpdateHealthReadingCommand }
  | { ok: false; error: string };

export function emptyHealthReadingForm(
  recordedOn = ''
): HealthReadingFormInput {
  return {
    recordedOn,
    heightCm: '',
    weightKg: '',
    heightFeet: '',
    heightInches: '',
    weightLb: '',
    systolic: '',
    diastolic: '',
    heartRate: '',
    notes: '',
  };
}

/**
 * Prefill the vitals form from a stored metric reading.
 * Imperial mode shows converted height/weight field strings.
 */
export function formFromHealthReading(
  reading: HealthReadingDto,
  unitSystem: UnitSystem
): HealthReadingFormInput {
  const base = emptyHealthReadingForm(reading.recorded_on);
  const systolic =
    reading.systolic_mm_hg != null ? String(reading.systolic_mm_hg) : '';
  const diastolic =
    reading.diastolic_mm_hg != null ? String(reading.diastolic_mm_hg) : '';
  const heartRate =
    reading.heart_rate_bpm != null ? String(reading.heart_rate_bpm) : '';
  const notes = reading.notes ?? '';

  if (unitSystem === 'metric') {
    return {
      ...base,
      heightCm:
        reading.height_cm != null ? String(round1(reading.height_cm)) : '',
      weightKg:
        reading.weight_kg != null ? String(round1(reading.weight_kg)) : '',
      systolic,
      diastolic,
      heartRate,
      notes,
    };
  }

  let heightFeet = '';
  let heightInches = '';
  if (reading.height_cm != null && Number.isFinite(reading.height_cm)) {
    const { feet, inches } = cmToFeetInches(reading.height_cm);
    heightFeet = String(feet);
    heightInches = String(inches);
  }
  const weightLb =
    reading.weight_kg != null && Number.isFinite(reading.weight_kg)
      ? String(round1(kgToLb(reading.weight_kg)))
      : '';

  return {
    ...base,
    heightFeet,
    heightInches,
    weightLb,
    systolic,
    diastolic,
    heartRate,
    notes,
  };
}

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
      height_cm = round1(feetInchesToCm(feet, inches));
    }

    const weight = parseOptionalPositiveFloat(input.weightLb, 'Weight');
    if (!weight.ok) {
      return weight;
    }
    weight_kg =
      weight.value == null ? null : round1(lbToKg(weight.value));
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
  if (
    systolic.value != null &&
    diastolic.value != null &&
    diastolic.value > systolic.value
  ) {
    return {
      ok: false,
      error: 'Diastolic must be less than or equal to systolic.',
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

/**
 * Validate form input and build a metric-only UpdateHealthReadingCommand.
 * Reuses create validation; omits immutable health_member_id.
 */
export function buildUpdateHealthReadingCommand(
  unitSystem: UnitSystem,
  input: HealthReadingFormInput
): BuildUpdateCommandResult {
  const built = buildCreateHealthReadingCommand('_', unitSystem, input);
  if (!built.ok) {
    return built;
  }
  const { health_member_id: _memberId, ...command } = built.command;
  return { ok: true, command };
}

/**
 * Convert height/weight field strings when the unit toggle changes.
 * Leaves non-numeric or empty height/weight fields blank in the target system.
 */
export function convertFormHeightWeight(
  input: HealthReadingFormInput,
  from: UnitSystem,
  to: UnitSystem
): HealthReadingFormInput {
  if (from === to) {
    return input;
  }

  if (from === 'metric' && to === 'imperial') {
    let heightFeet = '';
    let heightInches = '';
    let weightLb = '';
    const cmRaw = input.heightCm.trim();
    if (cmRaw !== '') {
      const cm = Number(cmRaw);
      if (Number.isFinite(cm) && cm > 0) {
        const { feet, inches } = cmToFeetInches(cm);
        heightFeet = String(feet);
        heightInches = String(inches);
      }
    }
    const kgRaw = input.weightKg.trim();
    if (kgRaw !== '') {
      const kg = Number(kgRaw);
      if (Number.isFinite(kg) && kg > 0) {
        weightLb = String(round1(kgToLb(kg)));
      }
    }
    return {
      ...input,
      heightCm: '',
      weightKg: '',
      heightFeet,
      heightInches,
      weightLb,
    };
  }

  let heightCm = '';
  let weightKg = '';
  const feetRaw = input.heightFeet.trim();
  const inchesRaw = input.heightInches.trim();
  if (feetRaw !== '' || inchesRaw !== '') {
    const feet = feetRaw === '' ? 0 : Number(feetRaw);
    const inches = inchesRaw === '' ? 0 : Number(inchesRaw);
    if (
      Number.isFinite(feet) &&
      Number.isFinite(inches) &&
      feet >= 0 &&
      inches >= 0 &&
      (feet > 0 || inches > 0)
    ) {
      heightCm = String(round1(feetInchesToCm(feet, inches)));
    }
  }
  const lbRaw = input.weightLb.trim();
  if (lbRaw !== '') {
    const lb = Number(lbRaw);
    if (Number.isFinite(lb) && lb > 0) {
      weightKg = String(round1(lbToKg(lb)));
    }
  }
  return {
    ...input,
    heightCm,
    weightKg,
    heightFeet: '',
    heightInches: '',
    weightLb: '',
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
