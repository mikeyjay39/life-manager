import { apiFetch, configureApiClient, resetApiClientConfig } from '@/lib/api/client';
import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyEmailToken,
} from '@/lib/auth/email-flows';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

const mockApiFetch = vi.mocked(apiFetch);

describe('email-flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiClientConfig();
    configureApiClient({ apiV1Prefix: '/life-manager/api/v1' });
  });

  it('given valid token when verifyEmailToken then posts verify-email body', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Email verified. You can sign in now.' }), {
        status: 200,
      })
    );

    const result = await verifyEmailToken('VALID');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/verify-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'VALID' }),
      })
    );
    expect(result).toEqual({
      success: true,
      message: 'Email verified. You can sign in now.',
    });
  });

  it('given well-formed email when requestPasswordReset then posts request body', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'If an account exists for that email, we sent a password reset link.',
        }),
        { status: 200 }
      )
    );

    const result = await requestPasswordReset('user@example.com');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/password-reset/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('given valid token when confirmPasswordReset then posts confirm body', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Password updated. You can sign in with your new password.',
        }),
        { status: 200 }
      )
    );

    const result = await confirmPasswordReset('VALID', 'password123');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/auth/password-reset/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'VALID', new_password: 'password123' }),
      })
    );
    expect(result.success).toBe(true);
  });
});
