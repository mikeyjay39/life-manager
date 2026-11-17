import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

/** Load KEY=value pairs from `.e2e.env` when present. */
export function loadE2eEnvFile(): void {
  const envPath = process.env.E2E_ENV_FILE || path.join(repoRoot, '.e2e.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function apiBaseUrl(): string {
  loadE2eEnvFile();
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/$/, '');
  }
  const port = process.env.APP_PORT || '3000';
  return `http://localhost:${port}`;
}

export function frontendUrl(): string {
  loadE2eEnvFile();
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  const port = process.env.FRONTEND_PORT || '8080';
  return `http://localhost:${port}`;
}

export function e2eDbPath(): string {
  loadE2eEnvFile();
  return process.env.E2E_DB_PATH || path.join(repoRoot, 'backend/data/e2e.db');
}

export function assertEmailProviderIsLog(): void {
  loadE2eEnvFile();
  const provider = (process.env.EMAIL_PROVIDER || 'log').toLowerCase();
  if (provider === 'resend') {
    throw new Error('EMAIL_PROVIDER=resend is forbidden in e2e');
  }
  if (provider !== 'log') {
    throw new Error(`e2e expects EMAIL_PROVIDER=log for #254, got ${provider}`);
  }
}
