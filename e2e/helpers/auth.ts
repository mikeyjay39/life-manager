import { apiBaseUrl, assertEmailProviderIsCapture } from './env';
import { extractAuthLink, waitForCapturedMail } from './mail';

export type EphemeralUser = {
  email: string;
  password: string;
};

/**
 * Create an ephemeral active user for one e2e run.
 *
 * Uses signup + capture mail + verify (no Resend, no SQLite activate hack).
 *
 * ```
 * Harness -> API : POST /auth/signup
 * Backend -> EMAIL_CAPTURE_DIR : write verify .eml
 * Harness -> read capture : extract /verify-email?token=
 * Harness -> API : POST /auth/verify-email
 * Harness -> Browser : sign in (manager stories)
 * ```
 *
 * Auth **stories** must exercise signup/verify/reset UI paths separately.
 * This helper may use API+capture so Documents/Health/Car e2e stay short.
 */
export async function createEphemeralUser(): Promise<EphemeralUser> {
  assertEmailProviderIsCapture();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const email = `e2e-${stamp}@example.com`;
  const password = `E2ePass-${stamp}!`;

  const response = await fetch(`${apiBaseUrl()}/life-manager/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`signup failed: ${response.status} ${body}`);
  }

  const mail = await waitForCapturedMail({
    to: email,
    subjectIncludes: 'Verify',
  });
  const link = extractAuthLink(mail.body, 'verify-email');
  const token = new URL(link).searchParams.get('token');
  if (!token) {
    throw new Error(`verify link missing token: ${link}`);
  }

  const verify = await fetch(
    `${apiBaseUrl()}/life-manager/api/v1/auth/verify-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    }
  );
  if (!verify.ok) {
    const body = await verify.text();
    throw new Error(`verify-email failed: ${verify.status} ${body}`);
  }

  return { email, password };
}
