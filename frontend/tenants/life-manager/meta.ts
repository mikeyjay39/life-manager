import type { TenantMeta } from '@/lib/tenant/types';

export const lifeManagerTenantMeta: TenantMeta = {
  id: 'life-manager',
  mountPath: '/life-manager',
  apiV1Prefix: '/life-manager/api/v1',
  displayName: 'Life Manager',
  hostnames: ['life-manager.jeszenka.com', 'life-manager.localhost'],
};
