#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function formatCommandError(error) {
  if (!error || typeof error !== 'object') {
    return 'Command failed.';
  }

  const maybeError = error;
  const stderr = typeof maybeError.stderr === 'string'
    ? maybeError.stderr.trim()
    : Buffer.isBuffer(maybeError.stderr)
      ? maybeError.stderr.toString('utf-8').trim()
      : '';
  if (stderr) return stderr;

  const stdout = typeof maybeError.stdout === 'string'
    ? maybeError.stdout.trim()
    : Buffer.isBuffer(maybeError.stdout)
      ? maybeError.stdout.toString('utf-8').trim()
      : '';
  if (stdout) return stdout;

  if (maybeError instanceof Error && maybeError.message) {
    return maybeError.message;
  }
  return 'Command failed.';
}

function readLocalVersion(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.version || typeof parsed.version !== 'string') {
    throw new Error('App version missing.');
  }
  return parsed.version.replace(/^v/i, '').trim();
}

function runCommand(command, cwd) {
  try {
    execSync(command, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(formatCommandError(error));
  }
}

const args = parseArgs(process.argv.slice(2));
const statusFile = args['status-file'];
const operationId = args['operation-id'];
const startedAt = args['started-at'] || new Date().toISOString();
const projectRoot = process.cwd();

if (!statusFile || !operationId) {
  console.error('Usage: node scripts/self-update.js --status-file <path> --operation-id <id> [--started-at <iso>] [--from-version <ver>]');
  process.exit(1);
}

const state = {
  state: 'running',
  step: 'starting',
  operationId,
  startedAt,
  fromVersion: typeof args['from-version'] === 'string' ? args['from-version'] : undefined,
  toVersion: undefined,
  message: 'Starting self-update.',
  finishedAt: undefined,
};

function writeStatus() {
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, JSON.stringify(state, null, 2));
}

function setStep(step, message) {
  state.state = 'running';
  state.step = step;
  state.message = message;
  writeStatus();
}

function markFailed(message) {
  state.state = 'failed';
  state.message = message;
  state.finishedAt = new Date().toISOString();
  writeStatus();
}

function markSucceeded() {
  state.state = 'succeeded';
  state.step = 'completed';
  state.message = 'Update applied successfully.';
  state.finishedAt = new Date().toISOString();
  writeStatus();
}

try {
  if (!state.fromVersion) {
    state.fromVersion = readLocalVersion(projectRoot);
  }
  writeStatus();

  setStep('fetching', 'Fetching latest origin/main.');
  runCommand('git fetch origin main', projectRoot);

  setStep('pulling', 'Pulling latest origin/main.');
  runCommand('git pull --ff-only origin main', projectRoot);

  setStep('installing-dependencies', 'Installing dependencies.');
  runCommand('npm ci --include=dev', projectRoot);

  setStep('building', 'Building application.');
  runCommand('npm run build', projectRoot);

  state.toVersion = readLocalVersion(projectRoot);

  const uid = typeof process.getuid === 'function'
    ? String(process.getuid())
    : process.env.UID;
  if (!uid) {
    throw new Error('Unable to determine user id for launchctl.');
  }

  setStep('restarting', 'Restarting LaunchAgent service.');
  runCommand(`launchctl kickstart -k gui/${uid}/com.stradl.server`, projectRoot);

  markSucceeded();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Self-update failed.';
  markFailed(message);
  process.exit(1);
}
