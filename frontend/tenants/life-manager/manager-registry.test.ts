import { resolveManagerTiles } from '@/tenants/life-manager/manager-registry';
import type { TenantScreens } from '@/lib/tenant/types';

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
