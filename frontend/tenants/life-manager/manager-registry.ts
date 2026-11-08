import type { TenantScreens } from '@/lib/tenant/types';

/** SF Symbol names mapped in `components/ui/icon-symbol`. */
export type ManagerIconName = 'doc.fill' | 'heart.fill' | 'car.fill';

export type ManagerRegistryEntry = {
  id: 'documents' | 'health' | 'cars';
  label: string;
  icon: ManagerIconName;
  /** Expo route used when the matching tenant screen is registered. */
  route: '/(tabs)/documents' | '/(tabs)/health' | '/(tabs)/car';
  screenKey: keyof Pick<TenantScreens, 'Documents' | 'Health' | 'Car'>;
};

/**
 * life-manager hub managers only. Do not add Location/Receipt until those epics exist.
 * Health/Cars stay listed even when screens are not registered (Coming soon).
 */
export const LIFE_MANAGER_MANAGERS: readonly ManagerRegistryEntry[] = [
  {
    id: 'documents',
    label: 'Documents',
    icon: 'doc.fill',
    route: '/(tabs)/documents',
    screenKey: 'Documents',
  },
  {
    id: 'health',
    label: 'Health',
    icon: 'heart.fill',
    route: '/(tabs)/health',
    screenKey: 'Health',
  },
  {
    id: 'cars',
    label: 'Cars',
    icon: 'car.fill',
    route: '/(tabs)/car',
    screenKey: 'Car',
  },
];

export type AvailableManagerTile = {
  id: ManagerRegistryEntry['id'];
  label: string;
  icon: ManagerIconName;
  status: 'available';
  route: ManagerRegistryEntry['route'];
};

export type ComingSoonManagerTile = {
  id: ManagerRegistryEntry['id'];
  label: string;
  icon: ManagerIconName;
  status: 'coming_soon';
  disabledReason: 'Coming soon';
};

export type ResolvedManagerTile = AvailableManagerTile | ComingSoonManagerTile;

/** Resolve hub tiles from tenant screens. Missing screens stay visible as Coming soon. */
export function resolveManagerTiles(screens: TenantScreens): ResolvedManagerTile[] {
  return LIFE_MANAGER_MANAGERS.map((entry) => {
    if (screens[entry.screenKey]) {
      return {
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        status: 'available' as const,
        route: entry.route,
      };
    }
    return {
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      status: 'coming_soon' as const,
      disabledReason: 'Coming soon' as const,
    };
  });
}

/**
 * Menu links for registered managers only (no Coming soon).
 * AppMenuBar keeps Home and Log Out outside this list.
 */
export function resolveRegisteredManagerMenuItems(
  screens: TenantScreens
): readonly ManagerRegistryEntry[] {
  return LIFE_MANAGER_MANAGERS.filter((entry) => Boolean(screens[entry.screenKey]));
}

/** True when pathname matches a manager Expo route (with or without the /(tabs) group). */
export function isManagerRouteActive(
  pathname: string,
  route: ManagerRegistryEntry['route']
): boolean {
  const leaf = route.replace('/(tabs)', '');
  return (
    pathname === route ||
    pathname === leaf ||
    (leaf.length > 0 && pathname.endsWith(leaf))
  );
}
