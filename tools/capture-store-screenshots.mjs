/**
 * Generates add on store screenshots that satisfy the Chrome Web Store spec:
 * at most 5 images per locale, exactly 1280x800, PNG 24 bit with no alpha.
 *
 * One full set is produced per locale listed in tools/lib/store-copy.mjs, into
 * assets/store/<locale>/. Both the interface and the marketing copy are in
 * that locale, so no image ever mixes two languages.
 *
 * Two stage pipeline, both stages provided by tools/lib/store-render.mjs:
 *   1. The real sidepanel is captured from the loaded extension.
 *   2. Each capture is composed onto a marketing canvas, rendered at 2x, then
 *      averaged down to 1280x800 and re-encoded as 24 bit RGB.
 *
 * Usage:
 *   pnpm build                  # .output/chrome-mv3 must exist
 *   pnpm screenshots:store
 *
 * Output: assets/store/en/*.png, assets/store/vi/*.png
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocaleCoverage, FOOTNOTE, LOCALES, SLIDES } from './lib/store-copy.mjs';
import { openStoreRenderer, SIDEPANEL_SIZE, verifyArtefacts } from './lib/store-render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extensionPath = path.resolve(rootDir, '.output/chrome-mv3');
const outputDir = path.resolve(rootDir, 'assets/store');

/** Chrome Web Store screenshot dimensions: exactly 1280x800 */
const CANVAS = { width: 1280, height: 800 };

/** Rendered width of the sidepanel on the canvas; height keeps its aspect ratio. */
const PANEL_WIDTH = 460;
const PANEL_HEIGHT = Math.round((PANEL_WIDTH / SIDEPANEL_SIZE.width) * SIDEPANEL_SIZE.height);

/** Composited against the canvas base colour so flattening never lightens edges. */
const CANVAS_BASE_RGB = [7, 10, 15];

/** Marketing canvas, authored at exactly CANVAS size in CSS pixels. */
function canvasHtml({ copy, footnote, panelDataUri, locale }) {
  const bullets = copy.bullets
    .map(
      (text) => `
        <li>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="9" />
            <path d="M5.8 10.4l2.6 2.6 5.6-6" />
          </svg>
          <span>${text}</span>
        </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${CANVAS.width}px;
    height: ${CANVAS.height}px;
    overflow: hidden;
    position: relative;
    background: #070a0f;
    font-family: 'Chakra Petch', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #e6edf3;
  }

  /* Subtle tactical cyber glow */
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
  }
  .glow-a { width: 720px; height: 720px; left: -220px; top: -260px; background: rgba(15, 247, 150, 0.22); }
  .glow-b { width: 620px; height: 620px; right: -160px; bottom: -220px; background: rgba(0, 229, 255, 0.16); }

  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(15, 247, 150, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 247, 150, 0.05) 1px, transparent 1px);
    background-size: 40px 40px;
    mask-image: radial-gradient(ellipse at 35% 45%, #000 25%, transparent 75%);
  }

  .stage {
    position: relative;
    display: flex;
    align-items: center;
    gap: 48px;
    width: 100%;
    height: 100%;
    padding: 0 56px 0 72px;
  }

  .copy { width: 560px; flex: 0 0 560px; }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 11px;
    margin-bottom: 22px;
    border: 1px solid rgba(15, 247, 150, 0.4);
    border-radius: 4px;
    background: rgba(15, 247, 150, 0.1);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #0ff796;
  }
  .eyebrow i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #0ff796;
    box-shadow: 0 0 8px #0ff796;
  }

  h1 {
    font-size: 42px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.015em;
    white-space: pre-line;
  }

  .body {
    margin-top: 18px;
    font-size: 16px;
    line-height: 1.55;
    color: #94a3b8;
  }

  ul { list-style: none; margin-top: 26px; display: flex; flex-direction: column; gap: 13px; }
  li { display: flex; align-items: flex-start; gap: 12px; font-size: 14.5px; line-height: 1.4; color: #cbd5e1; }
  li svg { width: 20px; height: 20px; flex: 0 0 20px; margin-top: 1px; }
  li circle { fill: rgba(15, 247, 150, 0.15); stroke: rgba(15, 247, 150, 0.5); stroke-width: 1; }
  li path { fill: none; stroke: #0ff796; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .shot {
    flex: 1 1 auto;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .shot img {
    width: ${PANEL_WIDTH}px;
    height: ${PANEL_HEIGHT}px;
    display: block;
    border-radius: 12px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.4),
      0 24px 64px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(15, 247, 150, 0.25);
  }

  .footnote {
    position: absolute;
    left: 72px;
    bottom: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.8);
  }
  .footnote svg { width: 14px; height: 14px; }
  .footnote path { fill: none; stroke: #0ff796; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
</head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <div class="grid"></div>

  <div class="stage">
    <div class="copy">
      <div class="eyebrow"><i></i>${copy.eyebrow}</div>
      <h1>${copy.headline}</h1>
      <p class="body">${copy.body}</p>
      <ul>${bullets}</ul>
    </div>
    <div class="shot"><img src="${panelDataUri}" alt="" /></div>
  </div>

  <div class="footnote">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
      <path d="M9 12.2l2 2 4-4.4" />
    </svg>
    <span>${footnote}</span>
  </div>
</body>
</html>`;
}

async function main() {
  assertLocaleCoverage();

  console.log('Launching Chromium with the extension loaded...');
  const renderer = await openStoreRenderer({ extensionPath });
  console.log(`Extension id: ${renderer.extensionId}`);

  const byLocale = new Map();

  try {
    for (const locale of LOCALES) {
      const localeDir = path.join(outputDir, locale);
      await fs.mkdir(localeDir, { recursive: true });

      const artefacts = [];
      console.log(`\n[${locale}]`);

      for (const slide of SLIDES) {
        console.log(`  Building ${locale}/${slide.file}`);

        const panelDataUri = await renderer.captureSidepanel({
          locale,
          tab: slide.tab,
          site: slide.site,
          mockData: slide.mockData,
        });

        const buffer = await renderer.renderCanvas({
          html: canvasHtml({
            copy: slide.copy[locale],
            footnote: FOOTNOTE[locale],
            panelDataUri,
            locale,
          }),
          ...CANVAS,
          background: CANVAS_BASE_RGB,
        });

        await fs.writeFile(path.join(localeDir, slide.file), buffer);
        artefacts.push({ file: `${locale}/${slide.file}`, buffer });
      }

      byLocale.set(locale, artefacts);
    }
  } finally {
    await renderer.close();
  }

  console.log('\nVerifying store requirements');
  let total = 0;
  for (const [locale, artefacts] of byLocale) {
    console.log(`  [${locale}]`);
    verifyArtefacts(artefacts, { ...CANVAS, maxCount: 5 });
    total += artefacts.length;
  }

  console.log(`\n${total} screenshots written to assets/store/ across ${byLocale.size} locales`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
