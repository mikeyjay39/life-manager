import type { TenantModule } from '@/lib/tenant/types';
import HealthScreen from '@/tenants/life-manager/screens/HealthScreen';
import HomeScreen from '@/tenants/life-manager/screens/HomeScreen';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import { lifeManagerThemeAssets } from '@/tenants/life-manager/theme-assets';

export const lifeManagerTenant: TenantModule = {
  ...lifeManagerTenantMeta,
  theme: {
    ...lifeManagerTenantMeta.theme,
    assets: lifeManagerThemeAssets,
  },
  screens: {
    Home: HomeScreen,
    Health: HealthScreen,
  },
};
