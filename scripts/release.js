#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

function fail(message) {
  console.error(`\nRelease aborted: ${message}`);
  process.exit(1);
}

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function runCapture(command) {
  return execSync(command, { encoding: 'utf-8' }).trim();
}

function ensureTool(tool) {
  try {
    runCapture(`${tool} --version`);
  } catch {
    fail(`Required tool "${tool}" is not available on PATH.`);
  }
}

const bump = process.argv[2];
if (!VALID_BUMPS.has(bump)) {
  console.error('Usage: node scripts/release.js <patch|minor|major>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');

process.chdir(projectRoot);

ensureTool('git');
ensureTool('gh');
ensureTool('npm');

const branch = runCapture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  fail(`You must release from "main" (current: "${branch}").`);
}

const dirty = runCapture('git status --porcelain');
if (dirty) {
  fail('Working tree is not clean. Commit or stash changes first.');
}

run('git fetch origin main');
run('git pull --ff-only origin main');
run(`npm version ${bump}`);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = pkg.version;
const tag = `v${version}`;

run('git push origin main --follow-tags');
run(`gh release create ${tag} --generate-notes`);

console.log(`\nRelease complete: ${tag}`);
