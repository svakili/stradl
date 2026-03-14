import fs from 'fs';
import os from 'os';
import path from 'path';

export const LAUNCH_AGENT_LABEL = 'com.stradl.server';
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3001;

export function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

export function formatCommandError(error) {
  if (!error || typeof error !== 'object') {
    return 'Command failed.';
  }

  const stderr = typeof error.stderr === 'string'
    ? error.stderr.trim()
    : Buffer.isBuffer(error.stderr)
      ? error.stderr.toString('utf-8').trim()
      : '';
  if (stderr) return stderr;

  const stdout = typeof error.stdout === 'string'
    ? error.stdout.trim()
    : Buffer.isBuffer(error.stdout)
      ? error.stdout.toString('utf-8').trim()
      : '';
  if (stdout) return stdout;

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Command failed.';
}

export function normalizeVersion(value) {
  return String(value).trim().replace(/^v/i, '');
}

export function getRuntimeArchiveName(version) {
  return `Stradl-runtime-v${normalizeVersion(version)}.tar.gz`;
}

export function getDataDirectory({
  env = process.env,
  homeDir = env.HOME || os.homedir(),
} = {}) {
  const configuredDataDir = env.STRADL_DATA_DIR?.trim();
  return configuredDataDir
    ? path.resolve(configuredDataDir)
    : path.join(homeDir, 'Library', 'Application Support', 'Stradl');
}

export function getRuntimePaths({
  dataDir,
  runtimeRoot,
} = {}) {
  const resolvedDataDir = dataDir
    ? path.resolve(dataDir)
    : getDataDirectory();
  const resolvedRuntimeRoot = runtimeRoot
    ? path.resolve(runtimeRoot)
    : path.join(resolvedDataDir, 'runtime');

  return {
    dataDir: resolvedDataDir,
    runtimeRoot: resolvedRuntimeRoot,
    versionsDir: path.join(resolvedRuntimeRoot, 'versions'),
    currentLink: path.join(resolvedRuntimeRoot, 'current'),
    downloadsDir: path.join(resolvedDataDir, 'updates'),
    logFile: path.join(resolvedDataDir, 'server.log'),
    errorLogFile: path.join(resolvedDataDir, 'server-error.log'),
  };
}

export function getLaunchAgentPath(homeDir = process.env.HOME || os.homedir()) {
  return path.join(homeDir, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
}

export function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}
