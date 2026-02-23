import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';

/**
 * Secure token storage for JWT authentication.
 * - On iOS/Android: Uses SecureStore (keychain/keystore)
 * - On Web: Falls back to AsyncStorage (localStorage)
 */

const isSecureStoreAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export async function getStoredToken(): Promise<string | null> {
  try {
    if (isSecureStoreAvailable) {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } else {
      return await AsyncStorage.getItem(TOKEN_KEY);
    }
  } catch (error) {
    console.error('Error reading stored token:', error);
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('Error storing token:', error);
    throw error;
  }
}

export async function clearStoredToken(): Promise<void> {
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch (error) {
    console.error('Error clearing stored token:', error);
    throw error;
  }
}
