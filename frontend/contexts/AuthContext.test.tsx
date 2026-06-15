import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { apiFetch, resolveApiUrl } from '@/lib/api/client';
import { getStoredToken, setStoredToken, clearStoredToken } from '@/lib/auth/storage';

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
    mockGetStoredToken.mockResolvedValue(null);
    mockSetStoredToken.mockResolvedValue(undefined);
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'jwt-token' }), { status: 200 })
    );
  });

  it('posts to the tenant-scoped login endpoint', async () => {
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>
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
    expect(mockSetStoredToken).toHaveBeenCalledWith('jwt-token');
  });
});
