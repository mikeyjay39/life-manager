import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getUnitSystemPreference,
  HEALTH_UNIT_SYSTEM_STORAGE_KEY,
  setUnitSystemPreference,
} from './unit-preference';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

const mockGetItem = vi.mocked(AsyncStorage.getItem);
const mockSetItem = vi.mocked(AsyncStorage.setItem);

describe('unit preference storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given no stored value when reading then defaults to metric', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(getUnitSystemPreference()).resolves.toBe('metric');
    expect(mockGetItem).toHaveBeenCalledWith(HEALTH_UNIT_SYSTEM_STORAGE_KEY);
  });

  it('given stored imperial when reading then returns imperial', async () => {
    mockGetItem.mockResolvedValue('imperial');
    await expect(getUnitSystemPreference()).resolves.toBe('imperial');
  });

  it('given invalid stored value when reading then defaults to metric', async () => {
    mockGetItem.mockResolvedValue('stones');
    await expect(getUnitSystemPreference()).resolves.toBe('metric');
  });

  it('when saving preference then writes the unit system key', async () => {
    mockSetItem.mockResolvedValue();
    await setUnitSystemPreference('imperial');
    expect(mockSetItem).toHaveBeenCalledWith(
      HEALTH_UNIT_SYSTEM_STORAGE_KEY,
      'imperial'
    );
  });
});
