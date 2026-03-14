#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRuntimeArchiveName } from './runtime-support.js';

function fail(message) {
  console.error(`\nPackaging aborted: ${message}`);
  process.exit(1);
}

function runCapture(command, cwd) {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const details = error instanceof Error ? error.message : 'command failed';
    fail(`${command}\n${details}`);
  }
}

function ensureExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }
}

function copyIntoStage(projectRoot, stagingDir, relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  ensureExists(sourcePath);
  const destinationPath = path.join(stagingDir, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function getProductionDependencyPaths(projectRoot) {
  const output = runCapture('npm ls --omit=dev --parseable --all', projectRoot);
  const nodeModulesRoot = path.join(projectRoot, 'node_modules');
  const candidates = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((entry) => entry !== projectRoot && entry.startsWith(nodeModulesRoot))
    .sort((left, right) => left.length - right.length);

  const selected = [];
  for (const candidate of candidates) {
    const alreadyCovered = selected.some((existing) => candidate.startsWith(`${existing}${path.sep}`));
    if (!alreadyCovered) {
      selected.push(candidate);
    }
  }

  return selected.map((absolutePath) => path.relative(projectRoot, absolutePath));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const releaseDir = path.join(projectRoot, 'release');
const installerSourcePath = path.join(projectRoot, 'scripts', 'install-stradl.sh');
const runtimeFiles = [
  'dist',
  'server/dist',
  'package.json',
  'scripts/install-service.js',
  'scripts/runtime-support.js',
  'scripts/self-update.js',
  'scripts/uninstall-service.js',
];

for (const relativePath of runtimeFiles) {
  ensureExists(path.join(projectRoot, relativePath));
}
ensureExists(installerSourcePath);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
if (!pkg.version || typeof pkg.version !== 'string') {
  fail('package.json is missing a string version.');
}

const version = pkg.version;
const archiveName = getRuntimeArchiveName(version);
const runtimeDirName = `Stradl-runtime-v${version}`;
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stradl-runtime-package-'));
const stagingDir = path.join(stagingRoot, runtimeDirName);

try {
  fs.mkdirSync(stagingDir, { recursive: true });

  for (const relativePath of runtimeFiles) {
    copyIntoStage(projectRoot, stagingDir, relativePath);
  }

  const dependencyPaths = getProductionDependencyPaths(projectRoot);
  for (const relativePath of dependencyPaths) {
    copyIntoStage(projectRoot, stagingDir, relativePath);
  }

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.cpSync(installerSourcePath, path.join(releaseDir, 'install-stradl.sh'));
  fs.chmodSync(path.join(releaseDir, 'install-stradl.sh'), 0o755);

  execSync(`tar -czf "${path.join(releaseDir, archiveName)}" -C "${stagingRoot}" "${runtimeDirName}"`, {
    stdio: 'inherit',
  });

  console.log(`Packaged ${archiveName}`);
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
