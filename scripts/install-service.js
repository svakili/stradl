import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const plistPath = path.join(process.env.HOME, 'Library/LaunchAgents/com.stradl.server.plist');
const nodePath = execSync('which node').toString().trim();

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.stradl.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${projectDir}/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${projectDir}/data/server.log</string>
  <key>StandardErrorPath</key>
  <string>${projectDir}/data/server-error.log</string>
</dict>
</plist>`;

fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.writeFileSync(plistPath, plist);

console.log(`Created ${plistPath}`);

try {
  execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'ignore' });
} catch { /* ignore if not loaded */ }

execSync(`launchctl load "${plistPath}"`);
console.log('Service loaded. Stradl will start on login and auto-restart.');
console.log('Open http://localhost:3001');
