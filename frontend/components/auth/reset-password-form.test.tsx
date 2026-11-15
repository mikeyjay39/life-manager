import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

vi.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderForm(
  token: string | undefined,
  onSubmit = vi.fn().mockResolvedValue({
    success: true,
    message: 'Password updated. You can sign in with your new password.',
  })
) {
  return {
    onSubmit,
    ...render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <ResetPasswordForm token={token} onSubmit={onSubmit} />
      </TenantThemeTestProvider>
    ),
  };
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given missing token when rendering then shows error without calling API', () => {
    const { onSubmit } = renderForm(undefined);

    expect(screen.getByText('This reset link is missing a token.')).toBeTruthy();
    expect(screen.getByText('Go to sign in')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('given password mismatch when submitting then blocks confirm API', () => {
    const { onSubmit } = renderForm('VALID');

    fireEvent.changeText(screen.getByLabelText('New password input'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm password input'), 'different');
    fireEvent.press(screen.getByLabelText('Set new password button'));

    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('given valid token and password when confirm succeeds then shows login path', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: true,
      message: 'Password updated. You can sign in with your new password.',
    });
    renderForm('VALID', onSubmit);

    fireEvent.changeText(screen.getByLabelText('New password input'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm password input'), 'password123');
    fireEvent.press(screen.getByLabelText('Set new password button'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('VALID', 'password123');
    });
    await waitFor(() => {
      expect(
        screen.getByText('Password updated. You can sign in with your new password.')
      ).toBeTruthy();
    });
    expect(screen.getByText('Go to sign in')).toBeTruthy();
  });
});
