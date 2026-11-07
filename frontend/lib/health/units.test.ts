import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HEALTH_UNIT_PREFERENCE_KEY,
  cmToFeetInches,
  computeBmi,
  defaultUnitSystemFromLocale,
  displayWeightKg,
  feetInchesToCm,
  formatHeightDisplay,
  formatWeightDisplay,
  kgToLb,
  lbToKg,
  loadUnitPreference,
  regionFromLocale,
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

  it('defaults from locale when preference is missing', async () => {
    // Given no saved preference and a US locale
    mockStorage.getItem.mockResolvedValueOnce(null);
    vi.stubGlobal('navigator', { language: 'en-US' });
    // When loading preference
    await expect(loadUnitPreference()).resolves.toBe('imperial');
    vi.unstubAllGlobals();
  });

  it('keeps a saved metric preference over a US locale', async () => {
    // Given US locale and a saved metric preference
    mockStorage.getItem.mockResolvedValueOnce('metric');
    vi.stubGlobal('navigator', { language: 'en-US' });
    // When loading preference
    await expect(loadUnitPreference()).resolves.toBe('metric');
    vi.unstubAllGlobals();
  });

  it('maps locale regions to the locked unit default', () => {
    // Given region tags from the locked map and common others
    expect(defaultUnitSystemFromLocale('en-US')).toBe('imperial');
    expect(defaultUnitSystemFromLocale('en-us')).toBe('imperial');
    expect(defaultUnitSystemFromLocale('en-LR')).toBe('imperial');
    expect(defaultUnitSystemFromLocale('my-MM')).toBe('imperial');
    expect(defaultUnitSystemFromLocale('en-GB')).toBe('metric');
    expect(defaultUnitSystemFromLocale('en')).toBe('metric');
    expect(defaultUnitSystemFromLocale('')).toBe('metric');
    expect(defaultUnitSystemFromLocale(null)).toBe('metric');
    expect(regionFromLocale('zh-Hans-CN')).toBe('CN');
    expect(regionFromLocale('en')).toBeNull();
  });

  it('formats weight and height for metric and imperial display', () => {
    expect(formatWeightDisplay(70, 'imperial')).toBe('154.3 lb');
    expect(formatHeightDisplay(180, 'imperial')).toBe('5 ft 10.9 in');
    expect(formatWeightDisplay(70.12, 'metric')).toBe('70.1 kg');
    expect(formatHeightDisplay(180.04, 'metric')).toBe('180 cm');
    expect(formatWeightDisplay(null, 'metric')).toBeNull();
    expect(formatHeightDisplay(undefined, 'imperial')).toBeNull();
  });
});
