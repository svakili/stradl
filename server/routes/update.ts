import * as childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { Router } from 'express';
import { findProjectRoot, getDataDirectory } from '../storage.js';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  name?: string;
}

export type UpdateApplyState = 'idle' | 'running' | 'succeeded' | 'failed';

interface UpdateApplyStatus {
  state: UpdateApplyState;
  step: string;
  message?: string;
  operationId?: string;
  startedAt?: string;
  finishedAt?: string;
  fromVersion?: string;
  toVersion?: string;
}

interface UpdateApplyStartResponse {
  operationId: string;
  startedAt: string;
  targetVersion?: string;
}

const SELF_UPDATE_FLAG = 'STRADL_ENABLE_SELF_UPDATE';
const UPDATE_STATUS_FILE = 'update-status.json';
const LAUNCH_AGENT_LABEL = 'com.stradl.server';
const PROJECT_ROOT = findProjectRoot();

let updateInFlight = false;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '');
}

function parseSemver(value: string): [number, number, number] {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error('Invalid version format.');
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionNewer(latest: string, current: string): boolean {
  const [latestMajor, latestMinor, latestPatch] = parseSemver(latest);
  const [currentMajor, currentMinor, currentPatch] = parseSemver(current);

  if (latestMajor !== currentMajor) return latestMajor > currentMajor;
  if (latestMinor !== currentMinor) return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}

function readCurrentVersion(): string {
  const packagePath = path.join(PROJECT_ROOT, 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf-8');
  const parsed = JSON.parse(raw) as { version?: string };

  if (!parsed.version || typeof parsed.version !== 'string') {
    throw new Error('App version missing.');
  }

  return normalizeVersion(parsed.version);
}

export function isSelfUpdateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SELF_UPDATE_FLAG] === 'true';
}

export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isLocalRequest(req: Request): boolean {
  return isLoopbackAddress(req.ip) || isLoopbackAddress(req.socket.remoteAddress);
}

function runCapture(command: string, cwd: string): string {
  return childProcess.execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getLaunchAgentPath(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new HttpError(400, 'HOME is not set; cannot verify LaunchAgent installation.');
  }
  return path.join(home, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
}

function ensureLaunchAgentInstalled(): void {
  const launchAgentPath = getLaunchAgentPath();
  if (!fs.existsSync(launchAgentPath)) {
    throw new HttpError(
      400,
      `LaunchAgent is not installed (${launchAgentPath}). Run npm run install-service first.`
    );
  }
}

function ensureCleanWorkingTree(projectRoot: string): void {
  let statusOutput: string;
  try {
    statusOutput = runCapture('git status --porcelain', projectRoot);
  } catch {
    throw new HttpError(500, 'Failed to inspect git working tree.');
  }

  if (statusOutput) {
    throw new HttpError(
      409,
      'Update blocked: working tree has local changes. Commit or stash changes before updating.'
    );
  }
}

function getUpdateStatusPath(): string {
  return path.join(getDataDirectory(), UPDATE_STATUS_FILE);
}

function writeUpdateApplyStatus(status: UpdateApplyStatus): void {
  const statusPath = getUpdateStatusPath();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

function readUpdateApplyStatus(): UpdateApplyStatus {
  const statusPath = getUpdateStatusPath();
  if (!fs.existsSync(statusPath)) {
    updateInFlight = false;
    return { state: 'idle', step: 'idle' };
  }

  try {
    const raw = fs.readFileSync(statusPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpdateApplyStatus>;
    if (
      parsed.state !== 'idle' &&
      parsed.state !== 'running' &&
      parsed.state !== 'succeeded' &&
      parsed.state !== 'failed'
    ) {
      return { state: 'idle', step: 'idle' };
    }

    const step = typeof parsed.step === 'string' ? parsed.step : 'idle';
    const status: UpdateApplyStatus = {
      state: parsed.state,
      step,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      operationId: typeof parsed.operationId === 'string' ? parsed.operationId : undefined,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : undefined,
      finishedAt: typeof parsed.finishedAt === 'string' ? parsed.finishedAt : undefined,
      fromVersion: typeof parsed.fromVersion === 'string' ? parsed.fromVersion : undefined,
      toVersion: typeof parsed.toVersion === 'string' ? parsed.toVersion : undefined,
    };

    if (status.state !== 'running') {
      updateInFlight = false;
    }

    return status;
  } catch {
    return { state: 'idle', step: 'idle' };
  }
}

function spawnSelfUpdateProcess(args: {
  operationId: string;
  startedAt: string;
  fromVersion: string;
}): void {
  const statusPath = getUpdateStatusPath();
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'self-update.js');

  if (!fs.existsSync(scriptPath)) {
    throw new HttpError(500, `Self-update script missing: ${scriptPath}`);
  }

  const child = childProcess.spawn(
    process.execPath,
    [
      scriptPath,
      '--status-file', statusPath,
      '--operation-id', args.operationId,
      '--started-at', args.startedAt,
      '--from-version', args.fromVersion,
    ],
    {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    }
  );
  child.unref();
}

export const updateRoutes = Router();

updateRoutes.get('/update-check', async (_req, res) => {
  const checkedAt = new Date().toISOString();

  let currentVersion: string;
  try {
    currentVersion = readCurrentVersion();
  } catch {
    res.status(500).send('Failed to read local app version.');
    return;
  }

  const owner = process.env.STRADL_UPDATE_OWNER || 'svakili';
  const repo = process.env.STRADL_UPDATE_REPO || 'stradl';
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stradl-update-checker',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let releaseRes: Response;
  try {
    releaseRes = await fetch(url, { headers });
  } catch {
    res.status(502).send('Failed to reach GitHub release API.');
    return;
  }

  if (!releaseRes.ok) {
    res.status(502).send(`Failed to check updates (GitHub ${releaseRes.status}).`);
    return;
  }

  let release: Partial<GitHubRelease>;
  try {
    release = (await releaseRes.json()) as Partial<GitHubRelease>;
  } catch {
    res.status(502).send('Failed to parse GitHub release response.');
    return;
  }

  if (
    typeof release.tag_name !== 'string' ||
    typeof release.html_url !== 'string' ||
    typeof release.published_at !== 'string'
  ) {
    res.status(502).send('GitHub release response missing required fields.');
    return;
  }

  const latestVersion = normalizeVersion(release.tag_name);

  let hasUpdate: boolean;
  try {
    hasUpdate = isVersionNewer(latestVersion, currentVersion);
  } catch {
    res.status(502).send('GitHub release version format is invalid.');
    return;
  }

  res.json({
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: release.html_url,
    releaseName: (release.name && release.name.trim()) || `v${latestVersion}`,
    publishedAt: release.published_at,
    checkedAt,
  });
});

updateRoutes.post('/update-apply', (req, res) => {
  let statusInitialized = false;
  try {
    if (!isSelfUpdateEnabled()) {
      throw new HttpError(403, `Self-update is disabled. Set ${SELF_UPDATE_FLAG}=true to enable.`);
    }

    if (!isLocalRequest(req)) {
      throw new HttpError(403, 'Self-update is only allowed from localhost.');
    }

    const existingStatus = readUpdateApplyStatus();
    if (updateInFlight || existingStatus.state === 'running') {
      throw new HttpError(409, 'An update is already running.');
    }

    ensureLaunchAgentInstalled();
    ensureCleanWorkingTree(PROJECT_ROOT);

    let fromVersion: string;
    try {
      fromVersion = readCurrentVersion();
    } catch {
      throw new HttpError(500, 'Failed to read local app version.');
    }

    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = new Date().toISOString();
    writeUpdateApplyStatus({
      state: 'running',
      step: 'queued',
      message: 'Update queued.',
      operationId,
      startedAt,
      fromVersion,
    });
    statusInitialized = true;

    spawnSelfUpdateProcess({ operationId, startedAt, fromVersion });
    updateInFlight = true;

    const payload: UpdateApplyStartResponse = { operationId, startedAt };
    res.status(202).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start update.';
    if (statusInitialized) {
      writeUpdateApplyStatus({
        state: 'failed',
        step: 'start',
        message,
        finishedAt: new Date().toISOString(),
      });
    }
    updateInFlight = false;

    if (error instanceof HttpError) {
      res.status(error.status).send(message);
      return;
    }
    res.status(500).send(message);
  }
});

updateRoutes.get('/update-apply-status', (_req, res) => {
  res.json(readUpdateApplyStatus());
});
