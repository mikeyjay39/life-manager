import type { TenantMeta } from '@/lib/tenant/types';

/** Header / logo sky (`assets/logo.jpeg`, `header-banner.jpeg`). */
export const LIFE_MANAGER_BRAND_SKY = '#56C4F5';
/**
 * Light chrome tint: azure deepen of the logo sky so the same token works as
 * button fill (with white onTint) and as link/icon foreground on white.
 * Prefer blue over teal (hue ~204, not cyan-green).
 */
export const LIFE_MANAGER_BRAND_TINT_LIGHT = '#0F71B3';
/** Soft azure for dark mode chrome (same family, readable on dark surfaces). */
export const LIFE_MANAGER_BRAND_TINT_DARK = '#64B5F6';
/** Deep blue header field for dark mode (matches logo azure, not teal). */
export const LIFE_MANAGER_BRAND_HEADER_DARK = '#163A56';

export const lifeManagerTenantMeta: TenantMeta = {
  id: 'life-manager',
  mountPath: '/life-manager',
  apiV1Prefix: '/life-manager/api/v1',
  displayName: 'Life Manager',
  hostnames: ['life-manager.jeszenka.com', 'life-manager.localhost'],
  theme: {
    headerBackground: { light: LIFE_MANAGER_BRAND_SKY, dark: LIFE_MANAGER_BRAND_HEADER_DARK },
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
