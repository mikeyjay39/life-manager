import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { LoginForm } from '@/components/auth/login-form';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderLoginForm(onSubmit = vi.fn().mockResolvedValue({ success: true })) {
  return {
    onSubmit,
    ...render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <LoginForm onSubmit={onSubmit} />
      </TenantThemeTestProvider>
    ),
  };
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows both required errors when submitting an empty form', () => {
    const { onSubmit } = renderLoginForm();

    fireEvent.press(screen.getByLabelText('Sign in button'));

    expect(screen.getByText('Username is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows only password error when username is filled', () => {
    const { onSubmit } = renderLoginForm();

    fireEvent.changeText(screen.getByLabelText('Username input'), 'admin');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    expect(screen.queryByText('Username is required.')).toBeNull();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows only username error when password is filled', () => {
    const { onSubmit } = renderLoginForm();

    fireEvent.changeText(screen.getByLabelText('Password input'), 'secret');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    expect(screen.getByText('Username is required.')).toBeTruthy();
    expect(screen.queryByText('Password is required.')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error when the user edits that field', () => {
    renderLoginForm();

    fireEvent.press(screen.getByLabelText('Sign in button'));
    expect(screen.getByText('Username is required.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Username input'), 'a');
    expect(screen.queryByText('Username is required.')).toBeNull();
  });

  it('submits credentials when both fields are filled', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    renderLoginForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Username input'), ' admin ');
    fireEvent.changeText(screen.getByLabelText('Password input'), ' secret ');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(' admin ', ' secret ');
    });
  });

  it('shows inline error when credentials are rejected', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      error: 'Invalid username or password',
    });
    renderLoginForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Username input'), 'admin');
    fireEvent.changeText(screen.getByLabelText('Password input'), 'wrong');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeTruthy();
    });
  });

  it('shows fallback error when rejection has no message', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: false });
    renderLoginForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Username input'), 'admin');
    fireEvent.changeText(screen.getByLabelText('Password input'), 'wrong');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    await waitFor(() => {
      expect(screen.getByText('Unknown error occurred.')).toBeTruthy();
    });
  });

  it('clears submit error when the user edits a field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      success: false,
      error: 'Invalid username or password',
    });
    renderLoginForm(onSubmit);

    fireEvent.changeText(screen.getByLabelText('Username input'), 'admin');
    fireEvent.changeText(screen.getByLabelText('Password input'), 'wrong');
    fireEvent.press(screen.getByLabelText('Sign in button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByLabelText('Password input'), 'wrong2');
    expect(screen.queryByText('Invalid username or password')).toBeNull();
  });
});
