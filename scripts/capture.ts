// Connects to the browser started by `pnpm browser` and saves a snapshot of the redeem tab:
// full HTML of every frame, a screenshot, and a summary of forms, inputs, buttons and iframes.
// Output goes to captures/ (gitignored) because it can contain account data.
//
// Usage: pnpm capture [label]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = process.env.CDP_PORT ?? '9222';
const HOST = process.env.CAPTURE_HOST ?? 'redeem.df.garena.sg';
const label = process.argv[2] ?? 'snapshot';

/** Drops query and hash, which may carry OAuth codes or session state. */
function stripUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw;
  }
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((p) => {
  try {
    return new URL(p.url()).hostname === HOST;
  } catch {
    return false;
  }
});

if (!page) {
  console.error(`No tab on ${HOST}. Open tabs:`);
  for (const p of pages) console.error(`  ${stripUrl(p.url())}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '');
const outDir = resolve(ROOT, 'captures', `${stamp}_${label}`);
await mkdir(outDir, { recursive: true });

const frames = page.frames();
const frameSummaries = [];
for (const [index, frame] of frames.entries()) {
  const html = await frame.content().catch((error: unknown) => `<!-- unreadable: ${error} -->`);
  await writeFile(resolve(outDir, `frame${index}.html`), html);

  const elements = await frame
    .evaluate(() => {
      const describe = (el: Element) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        name: el.getAttribute('name') ?? undefined,
        type: el.getAttribute('type') ?? undefined,
        class: el.getAttribute('class') ?? undefined,
        placeholder: el.getAttribute('placeholder') ?? undefined,
        role: el.getAttribute('role') ?? undefined,
        text: (el as HTMLElement).innerText?.trim().slice(0, 80) || undefined,
        visible: !!(el as HTMLElement).offsetParent,
      });
      return {
        forms: [...document.querySelectorAll('form')].map(describe),
        inputs: [...document.querySelectorAll('input, textarea, select')].map(describe),
        buttons: [
          ...document.querySelectorAll('button, [role="button"], input[type="submit"], a.btn'),
        ].map(describe),
        iframes: [...document.querySelectorAll('iframe')].map((el) => ({
          ...describe(el),
          src: el.getAttribute('src')?.split('?')[0],
        })),
        scripts: [...document.querySelectorAll('script[src]')].map(
          (el) => el.getAttribute('src')?.split('?')[0],
        ),
      };
    })
    .catch(() => null);

  frameSummaries.push({ index, url: stripUrl(frame.url()), elements });
}

await page.screenshot({ path: resolve(outDir, 'page.png'), fullPage: true });
await writeFile(
  resolve(outDir, 'summary.json'),
  JSON.stringify(
    {
      url: stripUrl(page.url()),
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      frames: frameSummaries,
    },
    null,
    2,
  ),
);

console.log(`Saved ${frames.length} frame(s) to ${outDir}`);
// Exit without browser.close() so the user's browser stays open
process.exit(0);
