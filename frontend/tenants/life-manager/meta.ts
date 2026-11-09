import type { TenantMeta } from '@/lib/tenant/types';

/** Sky-blue from logo/header (`assets/logo.jpeg`, `header-banner.jpeg`). */
export const LIFE_MANAGER_BRAND_SKY = '#56C4F5';
/** Softened sky for dark mode chrome (same family, less neon on dark surfaces). */
export const LIFE_MANAGER_BRAND_SKY_DARK = '#5AB4D9';
/** Label/icon color on light brand tint — white fails contrast on `#56C4F5`. */
export const LIFE_MANAGER_ON_TINT_LIGHT = '#11181C';

export const lifeManagerTenantMeta: TenantMeta = {
  id: 'life-manager',
  mountPath: '/life-manager',
  apiV1Prefix: '/life-manager/api/v1',
  displayName: 'Life Manager',
  hostnames: ['life-manager.jeszenka.com', 'life-manager.localhost'],
  theme: {
    headerBackground: { light: LIFE_MANAGER_BRAND_SKY, dark: '#1D3D47' },
    light: {
      tint: LIFE_MANAGER_BRAND_SKY,
      tabIconSelected: LIFE_MANAGER_BRAND_SKY,
      onTint: LIFE_MANAGER_ON_TINT_LIGHT,
    },
    dark: {
      tint: LIFE_MANAGER_BRAND_SKY_DARK,
      tabIconSelected: LIFE_MANAGER_BRAND_SKY_DARK,
    },
    copy: {
      loginSubtitle: 'Sign in to continue',
      homeTitleSuffix: '!',
    },
  },
};
