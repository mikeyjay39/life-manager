import { lifeManagerTenant } from '@/tenants/life-manager/config';
import type { TenantModule } from '@/lib/tenant/types';

const modulesById = new Map<string, TenantModule>([[lifeManagerTenant.id, lifeManagerTenant]]);

export function getTenantById(tenantId: string): TenantModule | undefined {
  return modulesById.get(tenantId);
}
