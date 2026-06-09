import type { FullConfig } from '@playwright/test';
import fs from 'fs';

const DEST = 'keepassxc-browser/tests';

export default async function globalSetup(config: FullConfig) {
  // Create a temporary directory and copy tests/* to keepassxc-browser/tests
  fs.existsSync(DEST);
  fs.cpSync('./tests', DEST, { recursive: true });

  // Copy sinon UMD bundle for in-browser mock tests
  const libDir = `${DEST}/lib`;
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  fs.cpSync('node_modules/sinon/pkg/sinon.js', `${libDir}/sinon.js`);
}
