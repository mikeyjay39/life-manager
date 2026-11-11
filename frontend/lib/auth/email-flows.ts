import { apiFetch } from '@/lib/api/client';
import type {
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  PasswordResetRequestRequest,
  PasswordResetRequestResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@/lib/api/types';

export type EmailFlowResult = {
  success: boolean;
  error?: string;
  message?: string;
};

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function verifyEmailToken(token: string): Promise<EmailFlowResult> {
  try {
    const body: VerifyEmailRequest = { token };
    const response = await apiFetch('/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 400) {
      return {
        success: false,
        error: await readErrorMessage(response, 'Could not verify email.'),
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: 'Server error. Please try again later.',
      };
    }

    const data = (await response.json()) as VerifyEmailResponse;
    return { success: true, message: data.message };
  } catch (error) {
    console.error('Verify email error:', error);
    return {
      success: false,
      error: 'Could not connect to server. Please check your connection.',
    };
  }
}

export async function requestPasswordReset(email: string): Promise<EmailFlowResult> {
  try {
    const body: PasswordResetRequestRequest = { email };
    const response = await apiFetch('/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 400) {
      return {
        success: false,
        error: await readErrorMessage(response, 'Could not request password reset.'),
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: 'Server error. Please try again later.',
      };
    }

    const data = (await response.json()) as PasswordResetRequestResponse;
    return { success: true, message: data.message };
  } catch (error) {
    console.error('Password reset request error:', error);
    return {
      success: false,
      error: 'Could not connect to server. Please check your connection.',
    };
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string
): Promise<EmailFlowResult> {
  try {
    const body: PasswordResetConfirmRequest = {
      token,
      new_password: newPassword,
    };
    const response = await apiFetch('/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 400) {
      return {
        success: false,
        error: await readErrorMessage(response, 'Could not reset password.'),
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: 'Server error. Please try again later.',
      };
    }

    const data = (await response.json()) as PasswordResetConfirmResponse;
    return { success: true, message: data.message };
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return {
      success: false,
      error: 'Could not connect to server. Please check your connection.',
    };
  }
}
