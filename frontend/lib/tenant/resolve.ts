import { Platform } from 'react-native';

import {
  DEFAULT_TENANT_ID,
  getTenantIdForHostname,
  isRegisteredTenantId,
  normalizeHostname,
} from '@/lib/tenant/registry';
import type { TenantResolution } from '@/lib/tenant/types';

export type ResolveTenantInput = {
  platform: typeof Platform.OS;
  hostname: string;
  search: string;
  envTenant?: string;
  envDefaultTenant?: string;
};

/**
 * Resolves the active tenant id at app bootstrap.
 *
 * ```text
 * Web (sequence)
 * Client -> resolveTenantId: hostname
 * resolveTenantId -> Registry: lookup hostname
 * alt local dev host
 *   resolveTenantId -> resolveLocalDevTenantId: ?tenant=, env default, hard default
 * else unknown
 *   resolveTenantId --> Client: null
 * Registry --> resolveTenantId: tenant id
 * resolveTenantId --> Client: tenant id
 *
 * Native (sequence)
 * Client -> resolveTenantId: EXPO_PUBLIC_TENANT
 * resolveTenantId -> Registry: lookup id
 * alt missing/unknown
 *   resolveTenantId --> Client: null
 * Registry --> resolveTenantId: tenant id
 * resolveTenantId --> Client: tenant id
 * ```
 */
export function isLocalDevHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}

function readTenantQueryParam(search: string): string | undefined {
  if (!search.startsWith('?')) {
    return undefined;
  }
  const params = new URLSearchParams(search);
  const tenant = params.get('tenant')?.trim();
  return tenant || undefined;
}

function resolveLocalDevTenantId(input: ResolveTenantInput): TenantResolution {
  const queryTenant = readTenantQueryParam(input.search);
  if (queryTenant && isRegisteredTenantId(queryTenant)) {
    return { tenantId: queryTenant, source: 'query-param' };
  }

  const envDefault = input.envDefaultTenant?.trim();
  if (envDefault && isRegisteredTenantId(envDefault)) {
    return { tenantId: envDefault, source: 'env-default' };
  }

  return { tenantId: DEFAULT_TENANT_ID, source: 'hard-default' };
}

export function resolveTenantId(input: ResolveTenantInput): TenantResolution | null {
  if (input.platform === 'web') {
    const hostname = normalizeHostname(input.hostname);
    const hostnameTenantId = getTenantIdForHostname(hostname);
    if (hostnameTenantId) {
      return { tenantId: hostnameTenantId, source: 'hostname' };
    }

    if (isLocalDevHostname(hostname)) {
      return resolveLocalDevTenantId(input);
    }

    return null;
  }

  const envTenant = input.envTenant?.trim();
  if (envTenant && isRegisteredTenantId(envTenant)) {
    return { tenantId: envTenant, source: 'env-tenant' };
  }

  const envDefault = input.envDefaultTenant?.trim();
  if (envDefault && isRegisteredTenantId(envDefault)) {
    return { tenantId: envDefault, source: 'env-default' };
  }

  if (isRegisteredTenantId(DEFAULT_TENANT_ID)) {
    return { tenantId: DEFAULT_TENANT_ID, source: 'hard-default' };
  }

  return null;
}

export function resolveTenantFromRuntime(): TenantResolution | null {
  const envTenant =
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_TENANT : undefined;
  const envDefaultTenant =
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_DEFAULT_TENANT : undefined;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return resolveTenantId({
      platform: 'web',
      hostname: window.location.hostname,
      search: window.location.search,
      envTenant,
      envDefaultTenant,
    });
  }

  return resolveTenantId({
    platform: Platform.OS,
    hostname: '',
    search: '',
    envTenant,
    envDefaultTenant,
  });
}
