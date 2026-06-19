import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { apiFetch, resolveApiUrl, resetApiClientConfig, configureApiClient } from '@/lib/api/client';
import { getStoredToken, setStoredToken } from '@/lib/auth/storage';
import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import type { TenantModule } from '@/lib/tenant/types';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock('@/lib/auth/storage', () => ({
  getStoredToken: vi.fn(),
  setStoredToken: vi.fn(),
  clearStoredToken: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockGetStoredToken = vi.mocked(getStoredToken);
const mockSetStoredToken = vi.mocked(setStoredToken);

const testTenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: { Home: () => null },
};

function LoginProbe() {
  const { login } = useAuth();

  React.useEffect(() => {
    void login('admin', 'password');
  }, [login]);

  return null;
}

describe('AuthContext login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiClientConfig();
    configureApiClient({ apiV1Prefix: testTenant.apiV1Prefix });
    mockGetStoredToken.mockResolvedValue(null);
    mockSetStoredToken.mockResolvedValue(undefined);
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 })
    );
  });

  it('posts to the tenant-scoped login endpoint', async () => {
    render(
      <TenantTestProvider tenant={testTenant}>
        <AuthProvider>
          <LoginProbe />
        </AuthProvider>
      </TenantTestProvider>
    );

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      })
    );
    expect(resolveApiUrl('/auth/login')).toBe(
      'http://localhost:3000/life-manager/api/v1/auth/login'
    );
    expect(mockSetStoredToken).toHaveBeenCalledWith('life-manager', 'jwt-token');
  });
});
