import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderForm(
  onSubmit = vi.fn().mockResolvedValue({
    success: true,
    message: 'If an account exists for that email, we sent a password reset link.',
  })
) {
  return {
    onSubmit,
    ...render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <ForgotPasswordForm onSubmit={onSubmit} />
      </TenantThemeTestProvider>
    ),
  };
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given empty email when submitting then shows required error', () => {
    const { onSubmit } = renderForm();

    fireEvent.press(screen.getByLabelText('Send reset link button'));

    expect(screen.getByText('Email is required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('given well-formed email when API succeeds then shows generic success', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: true,
      message: 'If an account exists for that email, we sent a password reset link.',
    });
    renderForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Email input'), 'user@example.com');
    fireEvent.press(screen.getByLabelText('Send reset link button'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('user@example.com');
    });
    await waitFor(() => {
      expect(
        screen.getByText(
          'If an account exists for that email, we sent a password reset link.'
        )
      ).toBeTruthy();
    });
  });

  it('given API rejection when submitting then shows error without leaking account existence', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      error: 'Server error. Please try again later.',
    });
    renderForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Email input'), 'user@example.com');
    fireEvent.press(screen.getByLabelText('Send reset link button'));

    await waitFor(() => {
      expect(screen.getByText('Server error. Please try again later.')).toBeTruthy();
    });
  });
});
