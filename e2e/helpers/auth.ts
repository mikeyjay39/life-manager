import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { apiBaseUrl, assertEmailProviderIsLog } from './env';

export type EphemeralUser = {
  email: string;
  password: string;
};

/**
 * Create an ephemeral active user for one e2e run.
 *
 * Temporary #254 path: POST /auth/signup (EMAIL_PROVIDER=log), then activate
 * via sqlite update inside life_manager_dev. Story #259 replaces activation
 * with capture/file verify.
 *
 * ```
 * Harness -> API : POST /auth/signup
 * Harness -> container sqlite : SET active=1
 * Harness -> Browser : sign in
 * ```
 */
export async function createEphemeralUser(): Promise<EphemeralUser> {
  assertEmailProviderIsLog();

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

  activateUserViaContainerSqlite(email);
  return { email, password };
}

function activateUserViaContainerSqlite(email: string): void {
  const script = path.resolve(__dirname, '../scripts/activate-user.sh');
  execFileSync('bash', [script, email], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
