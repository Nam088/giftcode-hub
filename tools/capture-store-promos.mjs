/**
 * Generates the two Chrome Web Store promotional tiles:
 *
 *   small promo tile    440x280
 *   marquee promo tile  1400x560
 *
 * Both must be JPEG or 24 bit PNG with no alpha channel. Rendering, encoding
 * and verification all live in tools/lib/store-render.mjs, shared with the
 * screenshot generator; the copy lives in tools/lib/store-copy.mjs.
 *
 * One pair is produced per locale, into assets/store/<locale>/, with both the
 * interface and the copy in that locale.
 *
 * Usage:
 *   pnpm build            # .output/chrome-mv3 must exist
 *   pnpm promos:store
 *
 * Output: assets/store/<locale>/promo-small.png, promo-marquee.png
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLocaleCoverage,
  LOCALES,
  MARQUEE_COPY,
  SMALL_PROMO_COPY,
} from './lib/store-copy.mjs';
import {
  inlineImage,
  openStoreRenderer,
  SIDEPANEL_SIZE,
  verifyArtefacts,
} from './lib/store-render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extensionPath = path.resolve(rootDir, '.output/chrome-mv3');
const outputDir = path.resolve(rootDir, 'assets/store');

const SMALL = { width: 440, height: 280 };
const MARQUEE = { width: 1400, height: 560 };

/** Canvas base colour, also used to composite away any transparency. */
const BASE_RGB = [7, 10, 15];

/**
 * Shared tactical cyber background layers.
 */
function backdrop() {
  return `
  body {
    margin: 0;
    position: relative;
    overflow: hidden;
    background: #070a0f;
    font-family: 'Chakra Petch', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #e6edf3;
  }
  * { box-sizing: border-box; }
  .glow { position: absolute; border-radius: 50%; filter: blur(80px); }
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(15, 247, 150, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 247, 150, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
  }`;
}

/** Shield tick used as the trust mark on both tiles. */
const SHIELD_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
    <path d="M9 12.2l2 2 4-4.4" />
  </svg>`;

/**
 * Small tile. At 440x280 there is no room for UI detail, so this is the icon,
 * the name and one claim, sized to stay legible when the store scales it down.
 */
function smallTileHtml({ iconDataUri, copy, locale }) {
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" /><style>
  ${backdrop()}
  body { width: ${SMALL.width}px; height: ${SMALL.height}px; }
  .glow-a { width: 320px; height: 320px; left: -100px; top: -120px; background: rgba(15, 247, 150, 0.22); }
  .glow-b { width: 280px; height: 280px; right: -80px; bottom: -100px; background: rgba(0, 229, 255, 0.16); }
  .grid { mask-image: radial-gradient(ellipse at 50% 40%, #000 20%, transparent 80%); }

  .inner {
    position: relative;
    height: 100%;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  img.icon {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(15, 247, 150, 0.25);
  }

  h1 {
    margin: 14px 0 0;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  p {
    margin: 8px 0 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: #94a3b8;
    max-width: 320px;
  }

  .trust {
    margin-top: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 10px;
    border: 1px solid rgba(15, 247, 150, 0.4);
    border-radius: 4px;
    background: rgba(15, 247, 150, 0.1);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0ff796;
  }
  .trust svg { width: 13px; height: 13px; }
  .trust path { fill: none; stroke: #0ff796; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style></head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <div class="grid"></div>
  <div class="inner">
    <img class="icon" src="${iconDataUri}" alt="" />
    <h1>Gift Code Redeemer</h1>
    <p>${copy.tagline}</p>
    <div class="trust">${SHIELD_SVG}<span>${copy.trust}</span></div>
  </div>
</body></html>`;
}

/**
 * Marquee tile. Wide and short, so the copy sits left and the panel sits right.
 */
function marqueeTileHtml({ iconDataUri, panelDataUri, copy, locale }) {
  const panelWidth = 360;
  const panelHeight = Math.round((panelWidth / SIDEPANEL_SIZE.width) * SIDEPANEL_SIZE.height);

  const marks = copy.marks
    .map((text) => `<span class="mark">${SHIELD_SVG}<span>${text}</span></span>`)
    .join('\n        ');

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" /><style>
  ${backdrop()}
  body { width: ${MARQUEE.width}px; height: ${MARQUEE.height}px; }
  .glow-a { width: 700px; height: 700px; left: -200px; top: -240px; background: rgba(15, 247, 150, 0.20); }
  .glow-b { width: 600px; height: 600px; right: 40px; bottom: -280px; background: rgba(0, 229, 255, 0.15); }
  .grid { background-size: 40px 40px; mask-image: radial-gradient(ellipse at 28% 45%, #000 25%, transparent 75%); }

  .inner {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    padding-left: 80px;
  }

  .copy { width: 680px; flex: 0 0 680px; }

  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  .brand img {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(15, 247, 150, 0.3);
  }
  .brand span { font-size: 20px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #0ff796; }

  h1 {
    margin: 0;
    font-size: 42px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  h1 em { font-style: normal; color: #0ff796; }

  p {
    margin: 18px 0 0;
    font-size: 16px;
    line-height: 1.55;
    color: #94a3b8;
    max-width: 580px;
  }

  .marks { margin-top: 26px; display: flex; align-items: center; gap: 20px; }
  .mark { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #cbd5e1; }
  .mark svg { width: 16px; height: 16px; }
  .mark path { fill: none; stroke: #0ff796; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .shot { position: absolute; right: 90px; top: 50%; transform: translateY(-50%); }
  .shot img {
    width: ${panelWidth}px;
    height: ${panelHeight}px;
    display: block;
    border-radius: 12px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.5),
      0 24px 60px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(15, 247, 150, 0.25);
  }
</style></head>
<body>
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <div class="grid"></div>
  <div class="inner">
    <div class="copy">
      <div class="brand">
        <img src="${iconDataUri}" alt="" />
        <span>Gift Code Redeemer</span>
      </div>
      <h1>${copy.headline}<br /><em>${copy.headlineAccent}</em></h1>
      <p>${copy.body}</p>
      <div class="marks">
        ${marks}
      </div>
    </div>
    <div class="shot"><img src="${panelDataUri}" alt="" /></div>
  </div>
</body></html>`;
}

async function main() {
  assertLocaleCoverage();

  const iconDataUri = await inlineImage(path.resolve(rootDir, 'assets/icon-128.png'));

  console.log('Launching Chromium with the extension loaded...');
  const renderer = await openStoreRenderer({ extensionPath });
  console.log(`Extension id: ${renderer.extensionId}`);

  const artefacts = [];

  try {
    for (const locale of LOCALES) {
      const localeDir = path.join(outputDir, locale);
      await fs.mkdir(localeDir, { recursive: true });
      console.log(`\n[${locale}]`);

      console.log(`  Building ${locale}/promo-small.png`);
      const small = await renderer.renderCanvas({
        html: smallTileHtml({ iconDataUri, copy: SMALL_PROMO_COPY[locale], locale }),
        ...SMALL,
        background: BASE_RGB,
      });
      await fs.writeFile(path.join(localeDir, 'promo-small.png'), small);
      artefacts.push({ file: `${locale}/promo-small.png`, buffer: small, spec: SMALL });

      console.log(`  Building ${locale}/promo-marquee.png`);
      const panelDataUri = await renderer.captureSidepanel({
        locale,
        tab: 'redeem',
        mockData: {
          draft: 'DFharbor738\nTrickOrTreat\nWELCOMETODF\nTACTICAL2026',
        },
      });

      const marquee = await renderer.renderCanvas({
        html: marqueeTileHtml({
          iconDataUri,
          panelDataUri,
          copy: MARQUEE_COPY[locale],
          locale,
        }),
        ...MARQUEE,
        background: BASE_RGB,
      });
      await fs.writeFile(path.join(localeDir, 'promo-marquee.png'), marquee);
      artefacts.push({ file: `${locale}/promo-marquee.png`, buffer: marquee, spec: MARQUEE });

      if (locale === 'en') {
        await fs.writeFile(path.join(rootDir, 'assets/promo-small.png'), small);
        await fs.writeFile(path.join(rootDir, 'assets/promo-marquee.png'), marquee);
      }
    }
  } finally {
    await renderer.close();
  }

  console.log('\nVerifying store requirements');
  for (const artefact of artefacts) {
    verifyArtefacts([artefact], artefact.spec);
  }

  console.log(
    `\n${artefacts.length} promo tiles written to assets/store/ across ${LOCALES.length} locales`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
