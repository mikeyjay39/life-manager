import type { HealthReadingDto } from '@/lib/api/types';

import {
  buildCreateHealthReadingCommand,
  buildUpdateHealthReadingCommand,
  convertFormHeightWeight,
  formFromHealthReading,
  type HealthReadingFormInput,
} from './health-reading-form-utils';

const MEMBER_ID = 'member-1';

function blankInput(
  overrides: Partial<HealthReadingFormInput> = {}
): HealthReadingFormInput {
  return {
    recordedOn: '2026-03-01',
    heightCm: '',
    weightKg: '',
    heightFeet: '',
    heightInches: '',
    weightLb: '',
    systolic: '',
    diastolic: '',
    heartRate: '',
    notes: '',
    ...overrides,
  };
}

describe('buildCreateHealthReadingCommand', () => {
  it('given date only when building then returns validation error', () => {
    // Given only a recorded date
    // When building the create command
    // Then validation fails and no command is produced
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least one vital or notes/i);
    }
  });

  it('given metric weight when building then POST fields use weight_kg only', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput({ weightKg: '70.5' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toEqual({
        health_member_id: MEMBER_ID,
        recorded_on: '2026-03-01',
        height_cm: null,
        weight_kg: 70.5,
        systolic_mm_hg: null,
        diastolic_mm_hg: null,
        heart_rate_bpm: null,
        notes: null,
      });
      expect(Object.keys(result.command)).not.toContain('weight_lb');
      expect(Object.keys(result.command)).not.toContain('height_ft');
    }
  });

  it('given imperial height and weight when building then converts to cm and kg', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'imperial',
      blankInput({
        heightFeet: '5',
        heightInches: '10.9',
        weightLb: '154.3',
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.height_cm).toBe(180.1);
      expect(result.command.weight_kg).toBe(70);
      expect(Object.keys(result.command)).not.toContain('weight_lb');
      expect(Object.keys(result.command)).not.toContain('height_feet');
      expect(Object.keys(result.command)).not.toContain('height_inches');
    }
  });

  it('given only systolic when building then requires diastolic too', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput({ systolic: '120' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/both systolic and diastolic/i);
    }
  });

  it('given diastolic greater than systolic when building then returns validation error', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput({ systolic: '110', diastolic: '120' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/diastolic must be less than or equal/i);
    }
  });

  it('given notes only when building then accepts the command', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput({ notes: 'Felt fine' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.notes).toBe('Felt fine');
    }
  });

  it('given missing date when building then returns validation error', () => {
    const result = buildCreateHealthReadingCommand(
      MEMBER_ID,
      'metric',
      blankInput({ recordedOn: '', weightKg: '70' })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/recorded date is required/i);
    }
  });
});

describe('convertFormHeightWeight', () => {
  it('given metric height and weight when switching to imperial then fills ft/in and lb', () => {
    const next = convertFormHeightWeight(
      blankInput({ heightCm: '180', weightKg: '70' }),
      'metric',
      'imperial'
    );
    expect(next.heightFeet).toBe('5');
    expect(next.heightInches).toBe('10.9');
    expect(next.weightLb).toBe('154.3');
    expect(next.heightCm).toBe('');
    expect(next.weightKg).toBe('');
  });

  it('given imperial height and weight when switching to metric then fills cm and kg', () => {
    const next = convertFormHeightWeight(
      blankInput({
        heightFeet: '5',
        heightInches: '10.9',
        weightLb: '154.3',
      }),
      'imperial',
      'metric'
    );
    expect(next.heightCm).toBe('180.1');
    expect(next.weightKg).toBe('70');
    expect(next.heightFeet).toBe('');
    expect(next.weightLb).toBe('');
  });
});

function sampleReading(
  overrides: Partial<HealthReadingDto> = {}
): HealthReadingDto {
  return {
    id: 'r1',
    health_member_id: MEMBER_ID,
    recorded_on: '2026-02-15',
    height_cm: 180,
    weight_kg: 70,
    systolic_mm_hg: 120,
    diastolic_mm_hg: 80,
    heart_rate_bpm: 72,
    notes: 'baseline',
    bmi: 21.6,
    created_at: '2026-02-15T00:00:00Z',
    updated_at: '2026-02-15T00:00:00Z',
    ...overrides,
  };
}

describe('formFromHealthReading', () => {
  it('given metric mode when prefilling then uses cm and kg strings', () => {
    const form = formFromHealthReading(sampleReading(), 'metric');
    expect(form.recordedOn).toBe('2026-02-15');
    expect(form.heightCm).toBe('180');
    expect(form.weightKg).toBe('70');
    expect(form.weightLb).toBe('');
    expect(form.systolic).toBe('120');
    expect(form.notes).toBe('baseline');
  });

  it('given imperial mode when prefilling then converts height and weight', () => {
    const form = formFromHealthReading(sampleReading(), 'imperial');
    expect(form.heightFeet).toBe('5');
    expect(form.heightInches).toBe('10.9');
    expect(form.weightLb).toBe('154.3');
    expect(form.heightCm).toBe('');
    expect(form.weightKg).toBe('');
  });
});

describe('buildUpdateHealthReadingCommand', () => {
  it('given imperial weight when building then PUT body uses weight_kg only', () => {
    const result = buildUpdateHealthReadingCommand(
      'imperial',
      blankInput({ weightLb: '154.3' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.weight_kg).toBe(70);
      expect(result.command).not.toHaveProperty('health_member_id');
      expect(result.command).not.toHaveProperty('weight_lb');
    }
  });
});
