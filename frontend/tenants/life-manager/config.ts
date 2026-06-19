import type { TenantModule } from '@/lib/tenant/types';
import HomeScreen from '@/tenants/life-manager/screens/HomeScreen';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';

export const lifeManagerTenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: HomeScreen,
  },
};
