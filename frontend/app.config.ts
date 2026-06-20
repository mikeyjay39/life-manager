import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

export default (): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const existingExtra =
    base.extra && typeof base.extra === 'object'
      ? { ...(base.extra as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const rawPublic = process.env.EXPO_PUBLIC_API_BASE_URL;
  const hasExplicitPublicApiUrl = rawPublic !== undefined;
  const extra: Record<string, unknown> = { ...existingExtra };

  if (hasExplicitPublicApiUrl) {
    extra.apiUrl = (rawPublic ?? '').trim();
  }

  const rawTenant = process.env.EXPO_PUBLIC_TENANT;
  if (rawTenant !== undefined) {
    extra.tenant = rawTenant.trim();
  }

  const rawDefaultTenant = process.env.EXPO_PUBLIC_DEFAULT_TENANT;
  if (rawDefaultTenant !== undefined) {
    extra.defaultTenant = rawDefaultTenant.trim();
  }

  return {
    ...base,
    extra: Object.keys(extra).length > 0 ? extra : base.extra,
  };
};
