import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from './env';

/** The e2e env file that up.sh writes (Compose project, ports, paths). */
export function e2eEnvFilePath(): string {
  return process.env.E2E_ENV_FILE || path.join(repoRoot(), '.e2e.env');
}

/**
 * Run one command inside the e2e `life_manager_dev` container and return
 * stdout as raw bytes. Throws when the env file is missing or the command
 * fails.
 *
 * Helpers use it when host bind mounts diverge (docker-from-dev-container):
 * then files under `/app/data` are not visible at the host path.
 */
export function execInLifeManagerDev(command: string[]): Buffer {
  const envPath = e2eEnvFilePath();
  if (!fs.existsSync(envPath)) {
    throw new Error(`No e2e env file at ${envPath}; start the stack with up.sh`);
  }
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      path.join(repoRoot(), 'docker-compose.yml'),
      '--env-file',
      envPath,
      '--profile',
      'docker-dev',
      'exec',
      '-T',
      'life_manager_dev',
      ...command,
    ],
    {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    }
  );
}
