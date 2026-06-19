import { resolveTenantId } from '@/lib/tenant/resolve';

describe('resolveTenantId', () => {
  it('resolves production hostname from the registry', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'life-manager.jeszenka.com',
        search: '',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'hostname' });
  });

  it('resolves fake subdomain hostnames for local dev', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'life-manager.localhost',
        search: '',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'hostname' });
  });

  it('uses ?tenant= on localhost before env default', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'localhost',
        search: '?tenant=life-manager',
        envDefaultTenant: 'life-manager',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'query-param' });
  });

  it('returns null for unknown ?tenant= on localhost', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'localhost',
        search: '?tenant=nothing',
      })
    ).toBeNull();
  });

  it('uses EXPO_PUBLIC_DEFAULT_TENANT on localhost when query param is absent', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: '127.0.0.1',
        search: '',
        envDefaultTenant: 'life-manager',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'env-default' });
  });

  it('falls back to life-manager on localhost', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'localhost',
        search: '',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'hard-default' });
  });

  it('returns null for unknown production hostnames', () => {
    expect(
      resolveTenantId({
        platform: 'web',
        hostname: 'unknown.example.com',
        search: '',
      })
    ).toBeNull();
  });

  it('resolves native builds from EXPO_PUBLIC_TENANT', () => {
    expect(
      resolveTenantId({
        platform: 'ios',
        hostname: '',
        search: '',
        envTenant: 'life-manager',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'env-tenant' });
  });

  it('falls back on native when EXPO_PUBLIC_TENANT is unset', () => {
    expect(
      resolveTenantId({
        platform: 'android',
        hostname: '',
        search: '',
      })
    ).toEqual({ tenantId: 'life-manager', source: 'hard-default' });
  });
});
