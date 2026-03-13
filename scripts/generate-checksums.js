#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : path.join(projectRoot, 'release');

if (!fs.existsSync(outputDir)) {
  console.error(`Release directory does not exist: ${outputDir}`);
  process.exit(1);
}

const zipFiles = fs.readdirSync(outputDir)
  .filter((name) => name.endsWith('.zip'))
  .sort();

if (zipFiles.length === 0) {
  console.error(`No zip artifacts found in ${outputDir}`);
  process.exit(1);
}

const lines = zipFiles.map((fileName) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(outputDir, fileName)));
  return `${hash.digest('hex')}  ${fileName}`;
});

const outputPath = path.join(outputDir, 'SHA256SUMS.txt');
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${outputPath}`);
