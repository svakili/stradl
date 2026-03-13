import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNING_STATUS_TTL_MS = 60 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeVersion(value) {
  return value.trim().replace(/^v/i, '');
}

function parseSemver(value) {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error('Invalid version format.');
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionNewer(latest, current) {
  const [latestMajor, latestMinor, latestPatch] = parseSemver(latest);
  const [currentMajor, currentMinor, currentPatch] = parseSemver(current);

  if (latestMajor !== currentMajor) return latestMajor > currentMajor;
  if (latestMinor !== currentMinor) return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}

function makeStatusPath(dataDir) {
  return path.join(dataDir, 'update-status.json');
}

function writeStatusFile(statusPath, status) {
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

function isProcessAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && typeof error === 'object' && error.code === 'ESRCH');
  }
}

function coerceTerminalStatus(parsed, message) {
  return {
    ...parsed,
    state: 'failed',
    step: 'failed',
    message,
    finishedAt: new Date().toISOString(),
  };
}

function readStatusFile(statusPath) {
  if (!fs.existsSync(statusPath)) {
    return { state: 'idle', step: 'idle' };
  }

  try {
    const raw = fs.readFileSync(statusPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { state: 'idle', step: 'idle' };
    }

    if (parsed.state === 'running') {
      const startedAt = typeof parsed.startedAt === 'string' ? Date.parse(parsed.startedAt) : Number.NaN;
      if (!Number.isNaN(startedAt) && Date.now() - startedAt > RUNNING_STATUS_TTL_MS) {
        return coerceTerminalStatus(parsed, 'Recovered a stale update state. Please try the update again.');
      }

      if (typeof parsed.processId === 'number' && !isProcessAlive(parsed.processId)) {
        return coerceTerminalStatus(parsed, 'Recovered an interrupted update. Please try the update again.');
      }
    }

    return parsed;
  } catch {
    return { state: 'idle', step: 'idle' };
  }
}

async function fetchLatestRelease(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'stradl-desktop-updater',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to check updates (GitHub ${response.status}).`);
  }

  const release = await response.json();
  if (
    typeof release.tag_name !== 'string' ||
    typeof release.html_url !== 'string' ||
    typeof release.published_at !== 'string' ||
    !Array.isArray(release.assets)
  ) {
    throw new Error('GitHub release response missing required fields.');
  }

  return {
    latestVersion: normalizeVersion(release.tag_name),
    releaseUrl: release.html_url,
    releaseName: typeof release.name === 'string' && release.name.trim()
      ? release.name
      : release.tag_name,
    publishedAt: release.published_at,
    assets: release.assets,
  };
}

function expectedArtifactName(version) {
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `Stradl-mac-${architecture}-v${version}.zip`;
}

function chooseReleaseAsset(release) {
  const artifactName = expectedArtifactName(release.latestVersion);
  const artifact = release.assets.find((asset) => asset && asset.name === artifactName);
  if (!artifact || typeof artifact.browser_download_url !== 'string') {
    throw new Error(`Release asset is missing: ${artifactName}`);
  }

  const checksumFile = release.assets.find((asset) => asset && asset.name === 'SHA256SUMS.txt');
  if (!checksumFile || typeof checksumFile.browser_download_url !== 'string') {
    throw new Error('Release is missing SHA256SUMS.txt.');
  }

  return { artifact, checksumFile };
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download update artifact (${response.status}).`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destinationPath);
    const readable = Readable.fromWeb(response.body);
    readable.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);
    readable.pipe(fileStream);
  });
}

async function fetchExpectedChecksum(url, artifactName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download checksum file (${response.status}).`);
  }

  const body = await response.text();
  const line = body.split(/\r?\n/).find((entry) => entry.trim().endsWith(artifactName));
  if (!line) {
    throw new Error(`Checksum not found for ${artifactName}.`);
  }

  const [hash] = line.trim().split(/\s+/);
  if (!hash) {
    throw new Error(`Checksum line is invalid for ${artifactName}.`);
  }
  return hash;
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function runOrThrow(command, args, errorMessage) {
  const result = spawnSync(command, args, { encoding: 'utf-8' });
  if (result.status === 0) {
    return;
  }

  const details = result.stderr?.trim() || result.stdout?.trim() || errorMessage;
  throw new Error(details);
}

function findAppBundle(rootPath) {
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = findAppBundle(entryPath);
      if (nested) return nested;
    }
  }
  return null;
}

function spawnInstallHelper({
  statusPath,
  targetAppPath,
  stagedAppPath,
  currentPid,
  operationId,
  startedAt,
  fromVersion,
  toVersion,
}) {
  const helperPath = path.join(__dirname, 'install-helper.mjs');

  const child = spawn(process.execPath, [
    helperPath,
    '--status-file', statusPath,
    '--target-app', targetAppPath,
    '--staged-app', stagedAppPath,
    '--current-pid', String(currentPid),
    '--operation-id', operationId,
    '--started-at', startedAt,
    '--from-version', fromVersion,
    '--to-version', toVersion,
  ], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  });
  child.unref();
}

export function createDesktopUpdater({
  app,
  appBundlePath,
  dataDir,
  canSelfUpdate,
  snapshotData,
}) {
  const statusPath = makeStatusPath(dataDir);
  const events = new EventEmitter();
  let updateInFlight = false;

  function setStatus(status) {
    const nextStatus = {
      ...status,
      processId: status.state === 'running' ? process.pid : status.processId,
    };
    writeStatusFile(statusPath, nextStatus);
    events.emit('status', nextStatus);
  }

  function getStatus() {
    const status = readStatusFile(statusPath);
    if (status.state === 'failed' && status.finishedAt && status.message?.startsWith('Recovered')) {
      writeStatusFile(statusPath, status);
    }
    if (status.state !== 'running') {
      updateInFlight = false;
    }
    return status;
  }

  async function checkForUpdates() {
    const currentVersion = normalizeVersion(app.getVersion());
    const checkedAt = new Date().toISOString();
    const owner = process.env.STRADL_UPDATE_OWNER || 'svakili';
    const repo = process.env.STRADL_UPDATE_REPO || 'stradl';
    const release = await fetchLatestRelease(owner, repo);

    return {
      currentVersion,
      latestVersion: release.latestVersion,
      hasUpdate: isVersionNewer(release.latestVersion, currentVersion),
      releaseUrl: release.releaseUrl,
      releaseName: release.releaseName,
      publishedAt: release.publishedAt,
      checkedAt,
    };
  }

  async function applyUpdate() {
    if (!canSelfUpdate()) {
      throw new Error('Desktop self-update is only enabled for packaged apps installed in ~/Applications.');
    }

    const existingStatus = getStatus();
    if (updateInFlight || existingStatus.state === 'running') {
      throw new Error('An update is already running.');
    }

    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = new Date().toISOString();
    const fromVersion = normalizeVersion(app.getVersion());

    setStatus({
      state: 'running',
      step: 'queued',
      message: 'Update queued.',
      operationId,
      startedAt,
      fromVersion,
    });
    updateInFlight = true;

    void (async () => {
      try {
        setStatus({
          state: 'running',
          step: 'snapshotting-data',
          message: 'Creating a backup of local tasks before update.',
          operationId,
          startedAt,
          fromVersion,
        });
        await snapshotData('pre-update');

        const owner = process.env.STRADL_UPDATE_OWNER || 'svakili';
        const repo = process.env.STRADL_UPDATE_REPO || 'stradl';
        const release = await fetchLatestRelease(owner, repo);
        const { artifact, checksumFile } = chooseReleaseAsset(release);
        const updateRoot = path.join(dataDir, 'updates', release.latestVersion);
        const archivePath = path.join(updateRoot, artifact.name);
        const stagingRoot = path.join(updateRoot, 'staging');

        setStatus({
          state: 'running',
          step: 'downloading',
          message: `Downloading v${release.latestVersion}.`,
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });
        await downloadFile(artifact.browser_download_url, archivePath);

        setStatus({
          state: 'running',
          step: 'verifying',
          message: 'Verifying downloaded update.',
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });
        const expectedHash = await fetchExpectedChecksum(checksumFile.browser_download_url, artifact.name);
        const actualHash = computeSha256(archivePath);
        if (expectedHash.toLowerCase() !== actualHash.toLowerCase()) {
          throw new Error('Downloaded update checksum did not match SHA256SUMS.txt.');
        }

        fs.rmSync(stagingRoot, { recursive: true, force: true });
        fs.mkdirSync(stagingRoot, { recursive: true });

        setStatus({
          state: 'running',
          step: 'staging',
          message: 'Preparing the new app version.',
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });
        runOrThrow('ditto', ['-xk', archivePath, stagingRoot], 'Failed to extract update archive.');

        const stagedAppPath = findAppBundle(stagingRoot);
        if (!stagedAppPath) {
          throw new Error('Extracted update archive did not contain a .app bundle.');
        }

        spawnSync('xattr', ['-dr', 'com.apple.quarantine', stagedAppPath], { encoding: 'utf-8' });

        setStatus({
          state: 'running',
          step: 'waiting-for-exit',
          message: 'Closing current version to install the update.',
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });

        spawnInstallHelper({
          statusPath,
          targetAppPath: appBundlePath,
          stagedAppPath,
          currentPid: process.pid,
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });

        setStatus({
          state: 'running',
          step: 'relaunching',
          message: 'Installing update and relaunching Stradl.',
          operationId,
          startedAt,
          fromVersion,
          toVersion: release.latestVersion,
        });

        setTimeout(() => app.quit(), 250);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to apply update.';
        setStatus({
          state: 'failed',
          step: 'failed',
          message,
          operationId,
          startedAt,
          finishedAt: new Date().toISOString(),
          fromVersion,
          processId: process.pid,
        });
        updateInFlight = false;
      }
    })();

    return {
      operationId,
      startedAt,
      targetVersion: undefined,
    };
  }

  return {
    checkForUpdates,
    applyUpdate,
    getStatus,
    onStatus(listener) {
      events.on('status', listener);
      return () => events.off('status', listener);
    },
  };
}
