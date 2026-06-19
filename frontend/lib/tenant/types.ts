import type { ComponentType } from 'react';

import type { TenantTheme } from '@/lib/tenant/theme/types';

export type TenantScreens = {
  Home: ComponentType;
};

export type TenantMeta = {
  id: string;
  mountPath: string;
  apiV1Prefix: string;
  displayName: string;
  hostnames: readonly string[];
  theme?: TenantTheme;
};

/** Frontend mirror of backend TenantMount — one module per tenant product. */
export type TenantModule = TenantMeta & {
  screens: TenantScreens;
};

export type TenantResolutionSource =
  | 'hostname'
  | 'query-param'
  | 'env-tenant'
  | 'env-default'
  | 'hard-default';

export type TenantResolution = {
  tenantId: string;
  source: TenantResolutionSource;
};
