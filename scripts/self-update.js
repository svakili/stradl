#!/usr/bin/env node
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  formatCommandError,
  getRuntimeArchiveName,
  getRuntimePaths,
  LAUNCH_AGENT_LABEL,
  parseArgs,
} from './runtime-support.js';

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

async function downloadFile(url, destinationPath) {
  const headers = {
    Accept: 'application/octet-stream',
    'User-Agent': 'stradl-runtime-updater',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function readExpectedChecksum(filePath, artifactName) {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    if (!match) continue;
    if (match[2] === artifactName) {
      return match[1].toLowerCase();
    }
  }

  throw new Error(`Checksum entry missing for ${artifactName}.`);
}

function replaceSymlink(targetPath, linkPath) {
  const tempPath = `${linkPath}.tmp-${process.pid}-${Date.now()}`;
  fs.rmSync(tempPath, { force: true, recursive: true });
  fs.symlinkSync(targetPath, tempPath);
  fs.renameSync(tempPath, linkPath);
}

function detectExtractedRuntimeDirectory(extractRoot) {
  const children = fs.readdirSync(extractRoot, { withFileTypes: true });
  const directory = children.find((entry) => entry.isDirectory());
  if (!directory) {
    throw new Error('Runtime archive did not contain a top-level directory.');
  }
  return path.join(extractRoot, directory.name);
}

const args = parseArgs(process.argv.slice(2));
const statusFile = args['status-file'];
const operationId = args['operation-id'];
const startedAt = args['started-at'] || new Date().toISOString();
const fromVersion = typeof args['from-version'] === 'string' ? args['from-version'] : undefined;
const targetVersion = typeof args['target-version'] === 'string' ? args['target-version'] : undefined;
const archiveUrl = typeof args['archive-url'] === 'string' ? args['archive-url'] : undefined;
const checksumUrl = typeof args['checksum-url'] === 'string' ? args['checksum-url'] : undefined;
const runtimeRoot = typeof args['runtime-root'] === 'string'
  ? args['runtime-root']
  : process.env.STRADL_RUNTIME_ROOT;
const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : undefined;

if (!statusFile || !operationId || !targetVersion || !archiveUrl || !checksumUrl || !runtimeRoot) {
  console.error(
    'Usage: node scripts/self-update.js --status-file <path> --operation-id <id> --target-version <ver> --archive-url <url> --checksum-url <url> --runtime-root <path> [--data-dir <path>] [--started-at <iso>] [--from-version <ver>]'
  );
  process.exit(1);
}

const runtimePaths = getRuntimePaths({ dataDir, runtimeRoot });
const artifactName = getRuntimeArchiveName(targetVersion);
const downloadDir = path.join(runtimePaths.downloadsDir, targetVersion);

const state = {
  state: 'running',
  step: 'starting',
  operationId,
  startedAt,
  fromVersion,
  toVersion: targetVersion,
  message: 'Starting update.',
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
  state.step = state.step === 'starting' ? 'failed' : state.step;
  state.message = message;
  state.finishedAt = new Date().toISOString();
  writeStatus();
}

function markSucceeded(message) {
  state.state = 'succeeded';
  state.step = 'completed';
  state.message = message;
  state.finishedAt = new Date().toISOString();
  writeStatus();
}

try {
  writeStatus();

  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(runtimePaths.versionsDir, { recursive: true });

  const archivePath = path.join(downloadDir, artifactName);
  const checksumsPath = path.join(downloadDir, 'SHA256SUMS.txt');

  setStep('downloading', `Downloading ${artifactName}.`);
  await downloadFile(archiveUrl, archivePath);
  await downloadFile(checksumUrl, checksumsPath);

  setStep('verifying', 'Verifying downloaded runtime.');
  const expectedChecksum = readExpectedChecksum(checksumsPath, artifactName);
  const actualChecksum = sha256File(archivePath);
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch for ${artifactName}.`);
  }

  const extractRoot = path.join(runtimePaths.versionsDir, `.tmp-${targetVersion}-${Date.now()}`);
  fs.mkdirSync(extractRoot, { recursive: true });

  setStep('extracting', 'Extracting runtime.');
  runCommand(`tar -xzf "${archivePath}" -C "${extractRoot}"`, runtimePaths.dataDir);

  const extractedRuntimeDir = detectExtractedRuntimeDirectory(extractRoot);
  const finalRuntimeDir = path.join(runtimePaths.versionsDir, path.basename(extractedRuntimeDir));
  if (!fs.existsSync(finalRuntimeDir)) {
    fs.renameSync(extractedRuntimeDir, finalRuntimeDir);
  }
  fs.rmSync(extractRoot, { recursive: true, force: true });

  setStep('switching-runtime', 'Switching to the new runtime.');
  replaceSymlink(finalRuntimeDir, runtimePaths.currentLink);

  const uid = typeof process.getuid === 'function'
    ? String(process.getuid())
    : process.env.UID;
  if (!uid) {
    throw new Error('Unable to determine user id for launchctl.');
  }

  setStep('restarting', 'Restarting the Stradl service.');
  runCommand(`launchctl kickstart -k gui/${uid}/${LAUNCH_AGENT_LABEL}`, runtimePaths.dataDir);

  markSucceeded(`Updated to v${targetVersion}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Self-update failed.';
  markFailed(message);
  process.exit(1);
}
