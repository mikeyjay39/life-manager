import Constants from 'expo-constants';

/**
 * API configuration for the Life Manager backend.
 *
 * Local HTTPS uses `backend/certs/cert.pem` (CN=localhost). The request host must match,
 * so the default is `https://localhost:3000` on all platforms.
 *
 * Android emulator: run `adb reverse tcp:3000 tcp:3000` so localhost reaches the host.
 * See docs/development_faq.md (Local HTTPS).
 *
 * Override order: EXPO_PUBLIC_API_BASE_URL (build/runtime for web) → Expo `extra.apiUrl`
 * (from app.config.ts / app.json) → default below.
 */

const getDefaultApiUrl = (): string => {
  return 'https://localhost:3000';
};

const rawPublic =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_API_BASE_URL : undefined;
const fromPublicEnv = rawPublic?.trim() ?? '';

export const API_BASE_URL =
  (fromPublicEnv || undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  getDefaultApiUrl();
