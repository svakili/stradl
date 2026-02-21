import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const plistPath = path.join(process.env.HOME, 'Library/LaunchAgents/com.stradl.server.plist');

if (fs.existsSync(plistPath)) {
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
    console.log('Service unloaded.');
  } catch { /* ignore if not loaded */ }

  fs.unlinkSync(plistPath);
  console.log(`Removed ${plistPath}`);
  console.log('Auto-start on login has been disabled.');
} else {
  console.log('No service found to uninstall.');
}
