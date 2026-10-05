import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extensionPath = path.resolve(rootDir, '.output/chrome-mv3');

async function main() {
  console.log('Launching browser with extension...');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 400, height: 600 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  const extensionId = background.url().split('/')[2];
  console.log(`Extension ID: ${extensionId}`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForSelector('main');
  await page.waitForTimeout(600);

  const panel = page.locator('div.flex.min-h-screen.flex-col');

  // 1. Capture Redeem Tab
  await panel.screenshot({ path: path.resolve(rootDir, 'assets/preview-redeem.png') });
  console.log('Saved: assets/preview-redeem.png');

  // 2. Click Results Tab
  const resultsBtn = page.locator('nav button').nth(1);
  if (await resultsBtn.count()) {
    await resultsBtn.click();
    await page.waitForTimeout(300);
    await panel.screenshot({ path: path.resolve(rootDir, 'assets/preview-results.png') });
    console.log('Saved: assets/preview-results.png');
  }

  // 3. Click History Tab
  const historyBtn = page.locator('nav button').nth(2);
  if (await historyBtn.count()) {
    await historyBtn.click();
    await page.waitForTimeout(300);
    await panel.screenshot({ path: path.resolve(rootDir, 'assets/preview-history.png') });
    console.log('Saved: assets/preview-history.png');
  }

  // 4. Click Settings Tab
  const settingsBtn = page.locator('nav button').nth(3);
  if (await settingsBtn.count()) {
    await settingsBtn.click();
    await page.waitForTimeout(300);
    await panel.screenshot({ path: path.resolve(rootDir, 'assets/preview-settings.png') });
    console.log('Saved: assets/preview-settings.png');
  }

  await context.close();
  console.log('Done capturing raw sidepanel previews!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
