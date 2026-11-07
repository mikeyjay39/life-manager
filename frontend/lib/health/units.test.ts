import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HEALTH_UNIT_PREFERENCE_KEY,
  cmToFeetInches,
  computeBmi,
  displayWeightKg,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  loadUnitPreference,
  round1,
  saveUnitPreference,
  weightUnitLabel,
} from './units';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

const mockStorage = AsyncStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

describe('health units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts 70 kg to lb with known fixture', () => {
    // Given 70 kg
    // When converting to lb
    const lb = round1(kgToLb(70));
    // Then ≈ 154.3 lb
    expect(lb).toBe(154.3);
    expect(round1(lbToKg(154.3))).toBe(70);
  });

  it('converts 180 cm to feet and inches', () => {
    // Given 180 cm
    const { feet, inches } = cmToFeetInches(180);
    // Then ≈ 5 ft 10.9 in (1-decimal display; round-trip stays near 180)
    expect(feet).toBe(5);
    expect(inches).toBe(10.9);
    expect(round1(feetInchesToCm(5, 10.9))).toBeCloseTo(180, 0);
  });

  it('computes BMI from metric height and weight only', () => {
    // Given 180 cm and 70 kg
    // When computing BMI
    const bmi = computeBmi(180, 70);
    // Then metric formula result (≈ 21.6)
    expect(bmi).toBe(21.6);
  });

  it('displayWeightKg uses lb labels in imperial mode', () => {
    expect(displayWeightKg(70, 'metric')).toBe(70);
    expect(displayWeightKg(70, 'imperial')).toBe(154.3);
    expect(weightUnitLabel('imperial')).toBe('lb');
    expect(weightUnitLabel('metric')).toBe('kg');
  });

  it('loads and saves unit preference under the shared key', async () => {
    mockStorage.getItem.mockResolvedValueOnce('imperial');
    await expect(loadUnitPreference()).resolves.toBe('imperial');
    expect(mockStorage.getItem).toHaveBeenCalledWith(HEALTH_UNIT_PREFERENCE_KEY);

    await saveUnitPreference('metric');
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      HEALTH_UNIT_PREFERENCE_KEY,
      'metric'
    );
  });

  it('defaults to metric when preference is missing', async () => {
    mockStorage.getItem.mockResolvedValueOnce(null);
    await expect(loadUnitPreference()).resolves.toBe('metric');
  });
});
