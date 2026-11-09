import type { TenantMeta } from '@/lib/tenant/types';

/** Header / logo sky (`assets/logo.jpeg`, `header-banner.jpeg`). */
export const LIFE_MANAGER_BRAND_SKY = '#56C4F5';
/**
 * Light chrome tint: logo sky deepened so the same token works as
 * button fill (with white onTint) and as link/icon foreground on white.
 */
export const LIFE_MANAGER_BRAND_TINT_LIGHT = '#307890';
/** Softened sky for dark mode chrome (same family, less neon on dark surfaces). */
export const LIFE_MANAGER_BRAND_TINT_DARK = '#5AB4D9';

export const lifeManagerTenantMeta: TenantMeta = {
  id: 'life-manager',
  mountPath: '/life-manager',
  apiV1Prefix: '/life-manager/api/v1',
  displayName: 'Life Manager',
  hostnames: ['life-manager.jeszenka.com', 'life-manager.localhost'],
  theme: {
    headerBackground: { light: LIFE_MANAGER_BRAND_SKY, dark: '#1D3D47' },
    light: {
      tint: LIFE_MANAGER_BRAND_TINT_LIGHT,
      tabIconSelected: LIFE_MANAGER_BRAND_TINT_LIGHT,
    },
    dark: {
      tint: LIFE_MANAGER_BRAND_TINT_DARK,
      tabIconSelected: LIFE_MANAGER_BRAND_TINT_DARK,
    },
    copy: {
      loginSubtitle: 'Sign in to continue',
      homeTitleSuffix: '!',
    },
  },
};
