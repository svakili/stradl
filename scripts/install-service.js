import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  formatCommandError,
  getDataDirectory,
  getLaunchAgentPath,
  getRuntimePaths,
  parseArgs,
} from './runtime-support.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const homeDir = process.env.HOME || os.homedir();
const args = parseArgs(process.argv.slice(2));
const projectDir = path.resolve(__dirname, '..');
const runtimeRootArg = typeof args['runtime-root'] === 'string'
  ? args['runtime-root']
  : process.env.STRADL_RUNTIME_ROOT;
const dataDirArg = typeof args['data-dir'] === 'string'
  ? args['data-dir']
  : undefined;
const dataDir = getDataDirectory({
  env: dataDirArg
    ? { ...process.env, STRADL_DATA_DIR: dataDirArg }
    : process.env,
  homeDir,
});
const runtimePaths = runtimeRootArg
  ? getRuntimePaths({ dataDir, runtimeRoot: runtimeRootArg })
  : null;
const resolvedProjectDir = runtimePaths ? runtimePaths.currentLink : projectDir;
const plistPath = getLaunchAgentPath(homeDir);
const shouldLoad = args['skip-load'] !== 'true' && process.env.STRADL_SKIP_LAUNCHCTL !== 'true';
const shouldOpen = args['open-browser'] === 'true' && process.env.STRADL_SKIP_OPEN !== 'true';
const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();

if (!fs.existsSync(path.join(resolvedProjectDir, 'server', 'dist', 'index.js'))) {
  throw new Error(`Server build missing at ${resolvedProjectDir}/server/dist/index.js`);
}

fs.mkdirSync(dataDir, { recursive: true });

const environmentEntries = Object.entries({
  ...(process.env.STRADL_DATA_DIR?.trim() || dataDirArg ? { STRADL_DATA_DIR: dataDir } : {}),
  ...(runtimePaths ? {
    STRADL_ENABLE_SELF_UPDATE: 'true',
    STRADL_RUNTIME_ROOT: runtimePaths.runtimeRoot,
  } : {}),
  ...(process.env.STRADL_UPDATE_OWNER?.trim()
    ? { STRADL_UPDATE_OWNER: process.env.STRADL_UPDATE_OWNER.trim() }
    : {}),
  ...(process.env.STRADL_UPDATE_REPO?.trim()
    ? { STRADL_UPDATE_REPO: process.env.STRADL_UPDATE_REPO.trim() }
    : {}),
  ...(process.env.GITHUB_TOKEN?.trim()
    ? { GITHUB_TOKEN: process.env.GITHUB_TOKEN.trim() }
    : {}),
});

const environmentBlock = environmentEntries.length === 0
  ? ''
  : `  <key>EnvironmentVariables</key>
  <dict>
${environmentEntries.map(([key, value]) => `    <key>${key}</key>
    <string>${value}</string>`).join('\n')}
  </dict>
`;

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.stradl.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${resolvedProjectDir}/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${resolvedProjectDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
${environmentBlock}  <key>StandardOutPath</key>
  <string>${dataDir}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${dataDir}/server-error.log</string>
</dict>
</plist>`;

fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.writeFileSync(plistPath, plist);

console.log(`Created ${plistPath}`);

if (shouldLoad) {
  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // Ignore if the service was not already loaded.
  }

  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'ignore' });
    console.log('Service loaded. Stradl will start on login and auto-restart.');
  } catch (error) {
    throw new Error(`Failed to load LaunchAgent: ${formatCommandError(error)}`);
  }
} else {
  console.log('LaunchAgent file written without loading it (skip requested).');
}

const appUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
console.log(`Open ${appUrl}`);

if (shouldOpen) {
  try {
    execSync(`open "${appUrl}"`, { stdio: 'ignore' });
  } catch (error) {
    throw new Error(`Service installed but failed to open browser: ${formatCommandError(error)}`);
  }
}
