import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');

export function repoRoot(): string {
  return REPO_ROOT;
}

/** Load KEY=value pairs from `.e2e.env` when present. */
export function loadE2eEnvFile(): void {
  const envPath = process.env.E2E_ENV_FILE || path.join(REPO_ROOT, '.e2e.env');
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
  return process.env.E2E_DB_PATH || path.join(REPO_ROOT, 'backend/data/e2e.db');
}

/**
 * Container path of the e2e DB. The backend runs in `/app` and reads
 * `DATABASE_URL=file:./data/e2e.db` from `.e2e.env`.
 */
export function e2eDbPathContainer(): string {
  loadE2eEnvFile();
  const databaseUrl = process.env.DATABASE_URL || 'file:./data/e2e.db';
  return path.posix.resolve('/app', databaseUrl.replace(/^file:/, ''));
}

/** Container path written by CaptureFileEmailSender (`EMAIL_CAPTURE_DIR`). */
export function emailCaptureDirContainer(): string {
  loadE2eEnvFile();
  return process.env.EMAIL_CAPTURE_DIR || '/app/data/e2e-mail-capture';
}

/**
 * Host path for CaptureFileEmailSender output (bind-mounted from container).
 * When empty under docker-from-dev-container, helpers fall back to docker exec.
 */
export function emailCaptureDirHost(): string {
  loadE2eEnvFile();
  if (process.env.EMAIL_CAPTURE_DIR_HOST) {
    return process.env.EMAIL_CAPTURE_DIR_HOST;
  }
  // Map /app/data/... -> ./backend/data/...
  const containerDir = emailCaptureDirContainer();
  if (containerDir.startsWith('/app/data/')) {
    return path.join(
      REPO_ROOT,
      'backend/data',
      containerDir.slice('/app/data/'.length)
    );
  }
  return containerDir;
}

/** e2e must use capture (or file alias), never Resend or body-redacted log-only. */
export function assertEmailProviderIsCapture(): void {
  loadE2eEnvFile();
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (provider === 'resend') {
    throw new Error('EMAIL_PROVIDER=resend is forbidden in e2e');
  }
  if (provider !== 'capture' && provider !== 'file') {
    throw new Error(
      `e2e expects EMAIL_PROVIDER=capture (or file), got ${provider || '(unset)'}`
    );
  }
}

/** @deprecated Use assertEmailProviderIsCapture — kept name alias for older smoke imports. */
export function assertEmailProviderIsLog(): void {
  assertEmailProviderIsCapture();
}
