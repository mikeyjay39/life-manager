import Constants from 'expo-constants';

/**
 * API configuration for the Life Manager backend.
 *
 * Default API URL is plain HTTP on localhost (matches the Axum server).
 *
 * Android emulator: run `adb reverse tcp:3000 tcp:3000` so localhost reaches the host.
 * See docs/development_faq.md (Local HTTP).
 *
 * Override order: EXPO_PUBLIC_API_BASE_URL (build/runtime for web) → Expo `extra.apiUrl`
 * (from app.config.ts / app.json) → default below.
 */

const getDefaultApiUrl = (): string => {
  return 'http://localhost:3000';
};

const rawPublic =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_API_BASE_URL : undefined;
const fromPublicEnv = rawPublic?.trim() ?? '';

export const API_BASE_URL =
  (fromPublicEnv || undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  getDefaultApiUrl();
