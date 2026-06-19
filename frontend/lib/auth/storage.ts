import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Secure token storage for JWT authentication.
 * - On iOS/Android: Uses SecureStore (keychain/keystore)
 * - On Web: Falls back to AsyncStorage (localStorage)
 *
 * Keys are scoped per tenant to avoid cross-tenant bleed during local dev.
 */

const isSecureStoreAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

function tokenKey(tenantId: string): string {
  return `auth_token:${tenantId}`;
}

export async function getStoredToken(tenantId: string): Promise<string | null> {
  const key = tokenKey(tenantId);
  try {
    if (isSecureStoreAvailable) {
      return await SecureStore.getItemAsync(key);
    }
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error('Error reading stored token:', error);
    return null;
  }
}

export async function setStoredToken(tenantId: string, token: string): Promise<void> {
  const key = tokenKey(tenantId);
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(key, token);
    } else {
      await AsyncStorage.setItem(key, token);
    }
  } catch (error) {
    console.error('Error storing token:', error);
    throw error;
  }
}

export async function clearStoredToken(tenantId: string): Promise<void> {
  const key = tokenKey(tenantId);
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error('Error clearing stored token:', error);
    throw error;
  }
}
