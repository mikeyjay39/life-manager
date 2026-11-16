import fs from 'node:fs';
import path from 'node:path';

import { emailCaptureDirHost, loadE2eEnvFile } from './env';

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
export function parseCapturedMail(filePath: string): CapturedMail {
  const text = fs.readFileSync(filePath, 'utf8');
  const toMatch = text.match(HEADER_TO);
  const subjectMatch = text.match(HEADER_SUBJECT);
  const blank = text.search(/\r?\n\r?\n/);
  const body = blank >= 0 ? text.slice(blank).replace(/^\r?\n\r?\n/, '') : text;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    to: (toMatch?.[1] || '').trim(),
    subject: (subjectMatch?.[1] || '').trim(),
    body,
    mtimeMs: stat.mtimeMs,
  };
}

function listCapturedMails(dir: string): CapturedMail[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.eml'))
    .map((name) => parseCapturedMail(path.join(dir, name)));
}

/**
 * Wait for the latest capture file matching recipient (and optional subject).
 *
 * ```
 * Harness -> EMAIL_CAPTURE_DIR : poll *.eml
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
  const dir = emailCaptureDirHost();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 250;
  const to = options.to.trim().toLowerCase();
  const subjectNeedle = options.subjectIncludes?.toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const matches = listCapturedMails(dir)
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
      ` under ${dir} within ${timeoutMs}ms`
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
