import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import { VerifyEmailPanel } from '@/components/auth/verify-email-panel';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

vi.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderPanel(
  token: string | undefined,
  onVerify = vi.fn().mockResolvedValue({
    success: true,
    message: 'Email verified. You can sign in now.',
  })
) {
  return {
    onVerify,
    ...render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <VerifyEmailPanel token={token} onVerify={onVerify} />
      </TenantThemeTestProvider>
    ),
  };
}

describe('VerifyEmailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given no token when rendering then shows error without calling API', async () => {
    const { onVerify } = renderPanel(undefined);

    expect(
      screen.getByText('This verification link is missing a token.')
    ).toBeTruthy();
    expect(screen.getByText('Go to sign in')).toBeTruthy();
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('given valid token when API succeeds then shows success and login path', async () => {
    const onVerify = vi.fn().mockResolvedValue({
      success: true,
      message: 'Email verified. You can sign in now.',
    });
    renderPanel('VALID', onVerify);

    await waitFor(() => {
      expect(onVerify).toHaveBeenCalledWith('VALID');
    });
    await waitFor(() => {
      expect(screen.getByText('Email verified. You can sign in now.')).toBeTruthy();
    });
    expect(screen.getByText('Go to sign in')).toBeTruthy();
  });

  it('given valid token when API fails then shows error', async () => {
    const onVerify = vi.fn().mockResolvedValue({
      success: false,
      error: 'This verification link is invalid or already used.',
    });
    renderPanel('BAD', onVerify);

    await waitFor(() => {
      expect(
        screen.getByText('This verification link is invalid or already used.')
      ).toBeTruthy();
    });
  });
});
