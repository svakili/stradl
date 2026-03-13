import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function parseArgs(argv) {
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

function writeStatus(statusPath, status) {
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify({
    ...status,
    processId: status.state === 'running' ? process.pid : status.processId,
  }, null, 2));
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      const maybeError = error;
      if (maybeError && typeof maybeError === 'object' && maybeError.code === 'ESRCH') {
        return;
      }
      throw error;
    }
  }

  throw new Error('Timed out waiting for the running app to exit.');
}

function runOrThrow(command, args, errorMessage) {
  const result = spawnSync(command, args, { encoding: 'utf-8' });
  if (result.status === 0) {
    return;
  }
  const details = result.stderr?.trim() || result.stdout?.trim() || errorMessage;
  throw new Error(details);
}

const args = parseArgs(process.argv.slice(2));
const statusPath = args['status-file'];
const targetApp = args['target-app'];
const stagedApp = args['staged-app'];
const currentPid = Number(args['current-pid']);
const operationId = args['operation-id'];
const startedAt = args['started-at'];
const fromVersion = args['from-version'];
const toVersion = args['to-version'];

if (!statusPath || !targetApp || !stagedApp || !currentPid || !operationId || !startedAt || !toVersion) {
  console.error('Missing required installer arguments.');
  process.exit(1);
}

const backupRoot = path.join(path.dirname(statusPath), 'updates', toVersion, 'previous');
const backupAppPath = path.join(backupRoot, path.basename(targetApp));

try {
  writeStatus(statusPath, {
    state: 'running',
    step: 'waiting-for-exit',
    message: 'Waiting for the running app to exit before replacing it.',
    operationId,
    startedAt,
    fromVersion,
    toVersion,
  });
  await waitForProcessExit(currentPid);

  fs.mkdirSync(path.dirname(targetApp), { recursive: true });
  fs.mkdirSync(backupRoot, { recursive: true });

  if (fs.existsSync(backupAppPath)) {
    fs.rmSync(backupAppPath, { recursive: true, force: true });
  }

  if (fs.existsSync(targetApp)) {
    fs.renameSync(targetApp, backupAppPath);
  }

  fs.renameSync(stagedApp, targetApp);

  writeStatus(statusPath, {
    state: 'running',
    step: 'relaunching',
    message: 'Launching the updated app.',
    operationId,
    startedAt,
    fromVersion,
    toVersion,
  });

  runOrThrow('open', ['-n', targetApp], 'Failed to relaunch Stradl.');

  fs.rmSync(backupAppPath, { recursive: true, force: true });

  writeStatus(statusPath, {
    state: 'succeeded',
    step: 'completed',
    message: 'Update applied successfully.',
    operationId,
    startedAt,
    finishedAt: new Date().toISOString(),
    fromVersion,
    toVersion,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to install updated app.';

  if (!fs.existsSync(targetApp) && fs.existsSync(backupAppPath)) {
    try {
      fs.renameSync(backupAppPath, targetApp);
    } catch {
      // Keep the original failure message.
    }
  }

  writeStatus(statusPath, {
    state: 'failed',
    step: 'failed',
    message,
    operationId,
    startedAt,
    finishedAt: new Date().toISOString(),
    fromVersion,
    toVersion,
  });
  process.exit(1);
}
