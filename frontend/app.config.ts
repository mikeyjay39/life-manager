import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

export default (): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const existingExtra =
    base.extra && typeof base.extra === 'object'
      ? { ...(base.extra as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (fromEnv) {
    return {
      ...base,
      extra: { ...existingExtra, apiUrl: fromEnv },
    };
  }

  return {
    ...base,
    extra: Object.keys(existingExtra).length > 0 ? existingExtra : base.extra,
  };
};
