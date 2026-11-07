import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeightDisplay,
  formatWeightDisplay,
  kgToLb,
  lbToKg,
  roundToDecimals,
} from './units';

describe('health unit helpers', () => {
  it('given 70 kg when converting to lb then returns 154.3', () => {
    // Given a known metric weight
    // When converting to imperial
    // Then pounds match the fixture (1 decimal)
    expect(kgToLb(70)).toBe(154.3);
  });

  it('given 154.3 lb when converting to kg then returns 70.0', () => {
    // Given the imperial fixture from 70 kg
    // When converting back to metric
    // Then kilograms round to 70.0
    expect(lbToKg(154.3)).toBe(70);
  });

  it('given 180 cm when converting to ft/in then returns 5 ft 10.9 in', () => {
    // Given a known metric height
    // When converting to imperial
    // Then feet and inches match the fixture
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 10.9 });
  });

  it('given 5 ft 10.9 in when converting to cm then returns near 180', () => {
    // Given the imperial fixture from 180 cm
    // When converting back to metric
    // Then centimetres round to 180.1 (1-decimal inch path)
    expect(feetInchesToCm(5, 10.9)).toBe(180.1);
  });

  it('given metric stored values when formatting imperial then shows lb and ft/in', () => {
    // Given stored metric readings
    // When formatting for imperial display
    // Then labels use lb and ft/in only
    expect(formatWeightDisplay(70, 'imperial')).toBe('154.3 lb');
    expect(formatHeightDisplay(180, 'imperial')).toBe('5 ft 10.9 in');
  });

  it('given metric stored values when formatting metric then shows kg and cm', () => {
    expect(formatWeightDisplay(70.12, 'metric')).toBe('70.1 kg');
    expect(formatHeightDisplay(180.04, 'metric')).toBe('180 cm');
  });

  it('given null vitals when formatting then returns null', () => {
    expect(formatWeightDisplay(null, 'metric')).toBeNull();
    expect(formatHeightDisplay(undefined, 'imperial')).toBeNull();
  });

  it('roundToDecimals rounds half away from zero via Math.round', () => {
    expect(roundToDecimals(1.25, 1)).toBe(1.3);
    expect(roundToDecimals(1.24, 1)).toBe(1.2);
  });
});
