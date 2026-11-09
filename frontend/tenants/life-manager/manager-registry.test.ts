import {
  LIFE_MANAGER_MANAGERS,
  isManagerRouteActive,
  resolveManagerTiles,
  resolveRegisteredManagerMenuItems,
} from '@/tenants/life-manager/manager-registry';
import type { TenantScreens } from '@/lib/tenant/types';

describe('LIFE_MANAGER_MANAGERS', () => {
  it('exposes Documents, Health, and Cars labels with a shared icon set', () => {
    // Given the life-manager registry
    // When entries are read
    // Then hub and menu share Documents / Health / Cars labels and IconSymbol names
    expect(LIFE_MANAGER_MANAGERS.map((entry) => entry.label)).toEqual([
      'Documents',
      'Health',
      'Cars',
    ]);
    expect(LIFE_MANAGER_MANAGERS.map((entry) => entry.icon)).toEqual([
      'doc.fill',
      'heart.fill',
      'car.fill',
    ]);
  });
});

describe('resolveManagerTiles', () => {
  it('marks Documents available and Health/Cars Coming soon when only Documents is registered', () => {
    // Given a tenant with Documents only
    const screens: TenantScreens = {
      Home: () => null,
      Documents: () => null,
    };
    // When tiles resolve
    const tiles = resolveManagerTiles(screens);
    // Then Documents can navigate; Health and Cars stay visible as Coming soon
    expect(tiles).toEqual([
      {
        id: 'documents',
        label: 'Documents',
        icon: 'doc.fill',
        status: 'available',
        route: '/(tabs)/documents',
      },
      {
        id: 'health',
        label: 'Health',
        icon: 'heart.fill',
        status: 'coming_soon',
        disabledReason: 'Coming soon',
      },
      {
        id: 'cars',
        label: 'Cars',
        icon: 'car.fill',
        status: 'coming_soon',
        disabledReason: 'Coming soon',
      },
    ]);
  });

  it('marks Health and Cars available when those screens are registered', () => {
    // Given Documents, Health, and Car screens
    const screens: TenantScreens = {
      Home: () => null,
      Documents: () => null,
      Health: () => null,
      Car: () => null,
    };
    // When tiles resolve
    const tiles = resolveManagerTiles(screens);
    // Then all three are available
    expect(tiles.map((t) => [t.id, t.status])).toEqual([
      ['documents', 'available'],
      ['health', 'available'],
      ['cars', 'available'],
    ]);
  });
});

describe('resolveRegisteredManagerMenuItems', () => {
  it('returns only managers whose screens are registered', () => {
    // Given Documents and Health only
    const screens: TenantScreens = {
      Home: () => null,
      Documents: () => null,
      Health: () => null,
    };
    // When menu items resolve
    const items = resolveRegisteredManagerMenuItems(screens);
    // Then Cars is omitted; labels stay registry copy
    expect(items.map((item) => item.id)).toEqual(['documents', 'health']);
    expect(items[0]?.label).toBe('Documents');
  });

  it('returns an empty list when no optional screens are registered', () => {
    // Given test-tenant-style screens
    const screens: TenantScreens = {
      Home: () => null,
    };
    // When menu items resolve
    const items = resolveRegisteredManagerMenuItems(screens);
    // Then the menu has no manager links
    expect(items).toEqual([]);
  });
});

describe('isManagerRouteActive', () => {
  it('matches Documents path forms', () => {
    expect(isManagerRouteActive('/documents', '/(tabs)/documents')).toBe(true);
    expect(isManagerRouteActive('/(tabs)/documents', '/(tabs)/documents')).toBe(true);
    expect(isManagerRouteActive('/', '/(tabs)/documents')).toBe(false);
  });
});
