import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  emailCaptureDirContainer,
  emailCaptureDirHost,
  loadE2eEnvFile,
  repoRoot,
} from './env';

export type CapturedMail = {
  path: string;
  to: string;
  subject: string;
  body: string;
  mtimeMs: number;
};

const HEADER_TO = /^To:\s*(.+)\s*$/im;
const HEADER_SUBJECT = /^Subject:\s*(.+)\s*$/im;

/**
 * Parse one CaptureFileEmailSender .eml file (To / Subject / blank / body).
 */
export function parseCapturedMail(
  filePath: string,
  text: string,
  mtimeMs: number
): CapturedMail {
  const toMatch = text.match(HEADER_TO);
  const subjectMatch = text.match(HEADER_SUBJECT);
  const blank = text.search(/\r?\n\r?\n/);
  const body = blank >= 0 ? text.slice(blank).replace(/^\r?\n\r?\n/, '') : text;
  return {
    path: filePath,
    to: (toMatch?.[1] || '').trim(),
    subject: (subjectMatch?.[1] || '').trim(),
    body,
    mtimeMs,
  };
}

function listCapturedMailsFromHost(dir: string): CapturedMail[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.eml'))
    .map((name) => {
      const filePath = path.join(dir, name);
      const text = fs.readFileSync(filePath, 'utf8');
      const stat = fs.statSync(filePath);
      return parseCapturedMail(filePath, text, stat.mtimeMs);
    });
}

/**
 * Read capture files inside life_manager_dev.
 * Needed when host bind mounts diverge (docker-from-dev-container).
 */
function listCapturedMailsFromDocker(containerDir: string): CapturedMail[] {
  const envPath = process.env.E2E_ENV_FILE || path.join(repoRoot(), '.e2e.env');
  const composeFile = path.join(repoRoot(), 'docker-compose.yml');
  if (!fs.existsSync(envPath)) {
    return [];
  }

  let listing = '';
  try {
    listing = execFileSync(
      'docker',
      [
        'compose',
        '-f',
        composeFile,
        '--env-file',
        envPath,
        '--profile',
        'docker-dev',
        'exec',
        '-T',
        'life_manager_dev',
        'sh',
        '-c',
        `ls -1 "${containerDir}"/*.eml 2>/dev/null || true`,
      ],
      {
        env: { ...process.env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch {
    return [];
  }

  const files = listing
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.eml'));

  const out: CapturedMail[] = [];
  for (const filePath of files) {
    try {
      const text = execFileSync(
        'docker',
        [
          'compose',
          '-f',
          composeFile,
          '--env-file',
          envPath,
          '--profile',
          'docker-dev',
          'exec',
          '-T',
          'life_manager_dev',
          'cat',
          filePath,
        ],
        {
          env: { ...process.env },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      // Prefer filename millis prefix when present; else Date.now order.
      const base = path.basename(filePath);
      const millis = Number.parseInt(base.split('-')[0] || '', 10);
      const mtimeMs = Number.isFinite(millis) ? millis : Date.now();
      out.push(parseCapturedMail(filePath, text, mtimeMs));
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function listCapturedMails(): CapturedMail[] {
  loadE2eEnvFile();
  const host = listCapturedMailsFromHost(emailCaptureDirHost());
  if (host.length > 0) {
    return host;
  }
  return listCapturedMailsFromDocker(emailCaptureDirContainer());
}

/**
 * Wait for the latest capture file matching recipient (and optional subject).
 *
 * ```
 * Harness -> host EMAIL_CAPTURE_DIR_HOST : poll *.eml
 * alt empty (docker-from-dev-container)
 *   Harness -> docker exec life_manager_dev : ls/cat EMAIL_CAPTURE_DIR
 * end
 * Harness -> pick newest To/Subject match
 * ```
 */
export async function waitForCapturedMail(options: {
  to: string;
  subjectIncludes?: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<CapturedMail> {
  loadE2eEnvFile();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 250;
  const to = options.to.trim().toLowerCase();
  const subjectNeedle = options.subjectIncludes?.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  const hostDir = emailCaptureDirHost();
  const containerDir = emailCaptureDirContainer();

  while (Date.now() < deadline) {
    const matches = listCapturedMails()
      .filter((m) => m.to.toLowerCase() === to)
      .filter((m) =>
        subjectNeedle ? m.subject.toLowerCase().includes(subjectNeedle) : true
      )
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (matches.length > 0) {
      return matches[0];
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `No captured mail for to=${options.to}` +
      (options.subjectIncludes
        ? ` subject~=${options.subjectIncludes}`
        : '') +
      ` under host=${hostDir} container=${containerDir} within ${timeoutMs}ms`
  );
}

/** Extract first verify-email or reset-password absolute URL from a body. */
export function extractAuthLink(
  body: string,
  kind: 'verify-email' | 'reset-password'
): string {
  const re = new RegExp(
    `https?://[^\\s]+/${kind}\\?token=[A-Za-z0-9._~-]+`,
    'i'
  );
  const match = body.match(re);
  if (!match) {
    throw new Error(`No ${kind} link found in captured mail body`);
  }
  return match[0];
}
