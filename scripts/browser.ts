// Launches Playwright's Chromium (Chrome for Testing) as a normal headed browser with a
// persistent profile, so you log in once and the session survives restarts.
// Remote debugging listens on 127.0.0.1 only, which lets `pnpm capture` read the page.
// Branded Google Chrome no longer accepts --load-extension, which is why Chromium is used.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const PROFILE_DIR = resolve(ROOT, '.chrome-profile');
const PORT = process.env.CDP_PORT ?? '9222';
const START_URL = 'https://redeem.df.garena.sg/vi/cdkgarena.html';

const extensionDir = ['chrome-mv3-dev', 'chrome-mv3']
  .map((name) => resolve(ROOT, '.output', name))
  .find((dir) => existsSync(resolve(dir, 'manifest.json')));

const args = [
  `--user-data-dir=${PROFILE_DIR}`,
  `--remote-debugging-port=${PORT}`,
  '--remote-debugging-address=127.0.0.1',
  '--no-first-run',
  '--no-default-browser-check',
];
if (extensionDir) {
  args.push(`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`);
}
// Later launches restore the previous tabs instead of opening a duplicate redeem tab
args.push(existsSync(resolve(PROFILE_DIR, 'Default')) ? '--restore-last-session' : START_URL);

console.log(`Chromium profile: ${PROFILE_DIR}`);
console.log(`CDP endpoint:     http://127.0.0.1:${PORT}`);
console.log(
  extensionDir
    ? `Extension:        ${extensionDir}`
    : 'Extension:        not built yet (run `pnpm dev` or `pnpm build` first to load it)',
);

const child = spawn(chromium.executablePath(), args, { stdio: 'ignore' });
child.on('exit', (code) => {
  console.log(`Chromium exited (${code ?? 'signal'})`);
  process.exit(0);
});
process.on('SIGINT', () => child.kill('SIGTERM'));
