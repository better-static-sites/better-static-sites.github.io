// manages the Docker container lifecycle for screenshot sessions.
// starts the container, optionally loads a bootstrap/kickstart file, polls
// a health check URL until the app is ready, then runs an optional postStart command.

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Start the Docker service described in config.docker and wait for it to be healthy.
 * After the healthcheck passes, runs docker.postStart if defined.
 *
 * @param {import('astro-better-declarative-screenshots').DockerConfig} dockerConfig
 * @param {string} projectRoot
 * @param {import('./discover.mjs').ScreenshotSpec[]} [specs] - the specs this run captures, passed to a docker.service function
 * @returns {Promise<void>}
 */
export async function startDocker(dockerConfig, projectRoot, specs = []) {
  if (!dockerConfig) return;

  const composePath = dockerConfig.compose
    ? path.resolve(projectRoot, dockerConfig.compose)
    : null;

  if (composePath) {
    // support both 'bootstrap' (preferred) and 'kickstart' (legacy alias)
    const bootstrapPath = dockerConfig.bootstrap ?? dockerConfig.kickstart;
    const env = buildEnv(dockerConfig.env ?? {}, bootstrapPath, projectRoot);
    const service = typeof dockerConfig.service === 'function' ? dockerConfig.service(specs) : dockerConfig.service;
    const serviceArg = service ? ` ${service}` : '';

    console.log(`[docker] starting services via ${path.relative(projectRoot, composePath)}`);
    execSync(
      `docker compose -f "${composePath}" up -d${serviceArg}`,
      { stdio: 'inherit', env: { ...process.env, ...env } }
    );
  }

  console.log(`[docker] waiting for ${dockerConfig.healthcheck.url}`);
  await pollHealthcheck(dockerConfig.healthcheck);
  console.log('[docker] app is ready');

  if (dockerConfig.postStart) {
    console.log(`[docker] running postStart: ${dockerConfig.postStart}`);
    execSync(dockerConfig.postStart, {
      stdio: 'inherit',
      cwd: projectRoot,
      env: process.env,
    });
  }
}

/**
 * Stop containers started for this session.
 * Does NOT remove volumes -- use `docker compose down -v` manually to reset seed data.
 *
 * @param {import('astro-better-declarative-screenshots').DockerConfig} dockerConfig
 * @param {string} projectRoot
 */
export function stopDocker(dockerConfig, projectRoot) {
  if (!dockerConfig?.compose) return;

  const composePath = path.resolve(projectRoot, dockerConfig.compose);
  console.log('[docker] stopping services');
  try {
    execSync(`docker compose -f "${composePath}" down`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('[docker] warning: docker compose down failed:', e.message);
  }
}

async function pollHealthcheck({ url, timeout = 60000, interval = 2000 }) {
  const deadline = Date.now() + timeout;
  let lastError;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(interval) });
      if (res.ok) {
        if (attempts > 1) process.stdout.write('\n');
        return;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    process.stdout.write('.');
    await sleep(interval);
  }

  process.stdout.write('\n');
  throw new Error(
    `[docker] health check timed out after ${timeout}ms waiting for ${url}` +
    (lastError ? `: ${lastError.message}` : '')
  );
}

function buildEnv(extraEnv, bootstrapPath, projectRoot) {
  const env = { ...extraEnv };
  if (bootstrapPath) {
    const absPath = path.resolve(projectRoot, bootstrapPath);
    let content;
    try {
      content = readFileSync(absPath, 'utf8');
    } catch {
      throw new Error(`[docker] bootstrap file not found: ${absPath}`);
    }
    // expose bootstrap content and path as env vars.
    // the docker-compose.yml can wire these into the container however it needs.
    // for FusionAuth: set FUSIONAUTH_APP_KICKSTART_FILE to SCREENSHOT_BOOTSTRAP_PATH.
    // for other apps: mount the file or use the content as a seed script input.
    env.SCREENSHOT_BOOTSTRAP_CONTENT = content;
    env.SCREENSHOT_BOOTSTRAP_PATH    = absPath;
    // legacy alias for backward compat
    env.SCREENSHOT_KICKSTART_CONTENT = content;
    env.SCREENSHOT_KICKSTART_PATH    = absPath;
  }
  return env;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
