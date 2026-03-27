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
 * Override via Expo `extra.apiUrl` when needed.
 */

const getDefaultApiUrl = (): string => {
  return 'https://localhost:3000';
};

export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  getDefaultApiUrl();
