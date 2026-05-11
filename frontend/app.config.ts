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

  if (hasExplicitPublicApiUrl) {
    return {
      ...base,
      extra: { ...existingExtra, apiUrl: (rawPublic ?? '').trim() },
    };
  }

  return {
    ...base,
    extra: Object.keys(existingExtra).length > 0 ? existingExtra : base.extra,
  };
};
