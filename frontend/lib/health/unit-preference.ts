import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UnitSystem } from './units';

/**
 * Persist the Health Manager metric/imperial UI preference on this device.
 * Charts (#110) may read the same key via `getUnitSystemPreference`.
 */
export const HEALTH_UNIT_SYSTEM_STORAGE_KEY = 'health_unit_system';

const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

function parseUnitSystem(raw: string | null): UnitSystem {
  if (raw === 'imperial' || raw === 'metric') {
    return raw;
  }
  return DEFAULT_UNIT_SYSTEM;
}

export async function getUnitSystemPreference(): Promise<UnitSystem> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_UNIT_SYSTEM_STORAGE_KEY);
    return parseUnitSystem(raw);
  } catch (error) {
    console.error('Error reading health unit preference:', error);
    return DEFAULT_UNIT_SYSTEM;
  }
}

export async function setUnitSystemPreference(system: UnitSystem): Promise<void> {
  try {
    await AsyncStorage.setItem(HEALTH_UNIT_SYSTEM_STORAGE_KEY, system);
  } catch (error) {
    console.error('Error storing health unit preference:', error);
    throw error;
  }
}
