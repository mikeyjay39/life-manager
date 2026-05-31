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
 *
 * If EXPO_PUBLIC_API_BASE_URL is set to an empty value, API_BASE_URL is empty so requests
 * use root-relative paths (same origin as the page — use behind the prod gateway).
 */

const getDefaultApiUrl = (): string => {
  return 'http://localhost:3000';
};

const hasExplicitPublicApiUrl =
  typeof process !== 'undefined' &&
  process.env.EXPO_PUBLIC_API_BASE_URL !== undefined;

const trimmedPublic =
  typeof process !== 'undefined'
    ? (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim()
    : '';

export const API_BASE_URL = hasExplicitPublicApiUrl
  ? trimmedPublic
  : ((Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    getDefaultApiUrl());

export const API_V1_PREFIX = '/life-manager/api/v1';
