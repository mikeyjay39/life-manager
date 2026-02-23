import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * API configuration for the Life Manager backend.
 * 
 * For local development:
 * - Web: http://localhost:3000
 * - Android emulator: http://10.0.2.2:3000
 * - iOS simulator: http://localhost:3000
 * - Physical device: use your machine's LAN IP (e.g., http://192.168.x.x:3000)
 * 
 * You can override this via app.config.js/ts by setting `extra.apiUrl`.
 */

const getDefaultApiUrl = (): string => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

export const API_BASE_URL = 
  Constants.expoConfig?.extra?.apiUrl || 
  getDefaultApiUrl();
