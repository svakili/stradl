import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  name?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(): string {
  const candidates = [
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../..'),
  ];

  const resolved = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'package.json'))
  );

  if (!resolved) {
    throw new Error('Project root not found.');
  }

  return resolved;
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
  const packagePath = path.join(findProjectRoot(), 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf-8');
  const parsed = JSON.parse(raw) as { version?: string };

  if (!parsed.version || typeof parsed.version !== 'string') {
    throw new Error('App version missing.');
  }

  return normalizeVersion(parsed.version);
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
