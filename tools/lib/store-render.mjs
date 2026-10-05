/**
 * Shared rendering session for add on store artwork.
 *
 * Store artwork has two awkward constraints that this module centralises:
 *
 *   1. Chromium only ever emits 32 bit RGBA PNG, while the stores require
 *      24 bit PNG with no alpha channel.
 *   2. Rendering at a 1x device scale factor gives visibly soft text at these
 *      sizes, so everything renders at `scale` and is averaged back down. That
 *      keeps text and UI edges supersampled, and the averaging is exact because
 *      the factor is an integer.
 *
 * Callers supply the canvas HTML and the target size; this module owns the
 * browser, the sidepanel capture, and the encoding.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { flattenAndDownscale, inspectPng } from './png.mjs';

/** Target sidepanel dimensions for store screenshot framing */
export const SIDEPANEL_SIZE = { width: 400, height: 600 };

/**
 * Launches Chromium with the built extension loaded and returns helpers for
 * capturing the sidepanel and rendering marketing canvases.
 *
 * @param {object} options
 * @param {string} options.extensionPath  Path to an unpacked MV3 build
 * @param {number} [options.scale]  Supersampling factor; must divide every canvas size
 */
export async function openStoreRenderer({ extensionPath, scale = 2 }) {
  try {
    await fs.access(extensionPath);
  } catch {
    throw new Error(`Extension build not found at ${extensionPath}. Run "pnpm build" first.`);
  }

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: scale,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  const extensionId = worker.url().split('/')[2];

  const sidepanelPage = await context.newPage();
  await sidepanelPage.setViewportSize(SIDEPANEL_SIZE);
  await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await sidepanelPage.waitForSelector('main');
  await sidepanelPage.waitForTimeout(600);

  const canvasPage = await context.newPage();

  return {
    extensionId,

    /**
     * Drives the real sidepanel into the requested state and returns it as a data
     * URI, ready to embed in a marketing canvas.
     *
     * @param {object} options
     * @param {'en'|'vi'} options.locale
     * @param {'redeem'|'results'|'history'|'settings'} options.tab
     * @param {string} [options.site]
     * @param {object} [options.mockData]
     */
    async captureSidepanel({ locale, tab, site = 'df-garena', mockData = {} }) {
      const tabIndices = { redeem: 0, results: 1, history: 2, settings: 3 };
      const tabIdx = tabIndices[tab] ?? 0;

      // Seed storage state directly inside extension context
      await sidepanelPage.evaluate(
        async ({ locale, site, tab, mockData }) => {
          const chrome = globalThis.chrome;
          if (!chrome?.storage?.local) return;

          const siteId = site === 'df_global' ? 'df-global' : 'df-garena';

          // Base settings
          const currentSettings =
            (await chrome.storage.local.get('local:settings'))['local:settings'] || {};
          await chrome.storage.local.set({
            'local:settings': {
              ...currentSettings,
              locale,
              activeSite: siteId,
              mode: 'auto',
              delayMs: 3000,
            },
          });

          // Mock drafts
          if (mockData.draft) {
            await chrome.storage.local.set({
              'local:drafts': { [siteId]: mockData.draft },
            });
          }

          // Mock results / jobs
          if (tab === 'results' || mockData.items) {
            const items = mockData.items || [
              {
                code: 'DFharbor738',
                status: 'success',
                server: 'ASIA-01',
                time: Date.now() - 5000,
              },
              { code: 'TrickOrTreat', status: 'used', server: 'ASIA-01', time: Date.now() - 12000 },
              {
                code: 'WELCOMETODF',
                status: 'success',
                server: 'ASIA-01',
                time: Date.now() - 25000,
              },
              {
                code: 'EXPIRED999',
                status: 'invalid',
                server: 'ASIA-01',
                time: Date.now() - 40000,
              },
            ];
            await chrome.storage.local.set({
              'local:jobs': {
                [siteId]: {
                  id: 'mock-job-1',
                  siteId,
                  account: mockData.account || 'Ghost_Operator#9812',
                  mode: 'auto',
                  status: 'done',
                  startedAt: Date.now() - 60000,
                  finishedAt: Date.now() - 5000,
                  items,
                },
              },
            });
          }

          // Mock history
          if (tab === 'history') {
            await chrome.storage.local.set({
              'local:history': [
                {
                  id: 'hist-1',
                  siteId,
                  account: 'Ghost_Operator#9812',
                  mode: 'auto',
                  startedAt: Date.now() - 3600000 * 2,
                  finishedAt: Date.now() - 3600000 * 2 + 45000,
                  total: 8,
                  counts: { success: 6, used: 2, invalid: 0, cooldown: 0, pending: 0, unknown: 0 },
                },
                {
                  id: 'hist-2',
                  siteId,
                  account: 'Ghost_Operator#9812',
                  mode: 'auto',
                  startedAt: Date.now() - 86400000,
                  finishedAt: Date.now() - 86400000 + 30000,
                  total: 5,
                  counts: { success: 4, used: 1, invalid: 0, cooldown: 0, pending: 0, unknown: 0 },
                },
              ],
            });
          }
        },
        { locale, site, tab, mockData },
      );

      // Reload to ensure Svelte store initializes fresh with seeded state
      await sidepanelPage.reload();
      await sidepanelPage.waitForSelector('main');
      await sidepanelPage.waitForTimeout(400);

      // Switch to targeted tab
      const tabButton = sidepanelPage.locator('nav button').nth(tabIdx);
      if (await tabButton.count()) {
        await tabButton.click();
        await sidepanelPage.waitForTimeout(350);
      }

      const panel = sidepanelPage.locator('div.flex.min-h-screen.flex-col');
      const png = await panel.screenshot({ type: 'png' });
      return `data:image/png;base64,${png.toString('base64')}`;
    },

    /**
     * Renders HTML at `width` x `height` CSS pixels and returns a 24 bit RGB
     * PNG of exactly that size.
     *
     * @param {object} options
     * @param {string} options.html
     * @param {number} options.width
     * @param {number} options.height
     * @param {[number, number, number]} options.background  Composited behind any transparency
     */
    async renderCanvas({ html, width, height, background }) {
      if ((width * scale) % scale !== 0 || (height * scale) % scale !== 0) {
        throw new Error(`Canvas ${width}x${height} is not compatible with scale ${scale}`);
      }

      await canvasPage.setViewportSize({ width, height });
      await canvasPage.setContent(html, { waitUntil: 'load' });
      await canvasPage.waitForTimeout(350);

      const supersampled = await canvasPage.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
      });

      return flattenAndDownscale(supersampled, scale, background);
    },

    async close() {
      await context.close();
    },
  };
}

/**
 * Inlines a local image as a data URI, so canvases never depend on file paths
 * resolving inside the browser.
 */
export async function inlineImage(filePath) {
  const data = await fs.readFile(filePath);
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mime = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`;
  return `data:${mime};base64,${data.toString('base64')}`;
}

/**
 * Asserts every artefact meets the store requirements and prints a report.
 * Throws rather than letting a rejected asset be uploaded.
 *
 * @param {Array<{file: string, buffer: Buffer}>} artefacts
 * @param {object} spec
 * @param {number} spec.width
 * @param {number} spec.height
 * @param {number} [spec.maxCount]
 */
export function verifyArtefacts(artefacts, { width, height, maxCount }) {
  let ok = true;

  for (const { file, buffer } of artefacts) {
    const info = inspectPng(buffer);
    const valid =
      info.width === width &&
      info.height === height &&
      info.bitDepth === 8 &&
      info.colourType === 2 &&
      !info.hasAlpha;
    ok = ok && valid;
    console.log(
      `  ${valid ? 'PASS' : 'FAIL'}  ${file}  ${info.width}x${info.height}  ` +
        `colour type ${info.colourType}  alpha ${info.hasAlpha ? 'yes' : 'no'}  ` +
        `${(info.bytes / 1024).toFixed(0)} KB`,
    );
  }

  if (maxCount !== undefined && artefacts.length > maxCount) {
    ok = false;
    console.log(
      `  FAIL  ${artefacts.length} images produced, the store accepts at most ${maxCount}`,
    );
  }

  if (!ok) {
    throw new Error('One or more assets do not meet the store requirements');
  }
}
