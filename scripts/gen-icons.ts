import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();

  async function render(svgPath: string, outPath: string, width: number, height: number) {
    const svg = fs.readFileSync(svgPath, 'utf8');
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(
      `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;overflow:hidden;}html,body{width:100%;height:100%;background:transparent;}svg{width:100%;height:100%;display:block;}</style></head><body>${svg}</body></html>`,
    );
    await page.screenshot({ path: outPath, omitBackground: true });
    await page.close();
    const stat = fs.statSync(outPath);
    console.log(`Rendered ${outPath} (${width}x${height}): ${stat.size} bytes`);
  }

  // Icons from flat vector icon.svg
  await render('assets/icon.svg', 'public/icon/16.png', 16, 16);
  await render('assets/icon.svg', 'public/icon/32.png', 32, 32);
  await render('assets/icon.svg', 'public/icon/48.png', 48, 48);
  await render('assets/icon.svg', 'public/icon/96.png', 96, 96);
  await render('assets/icon.svg', 'public/icon/128.png', 128, 128);
  await render('assets/icon.svg', 'assets/icon-128.png', 128, 128);
  await render('assets/icon.svg', 'assets/icon-512.png', 512, 512);

  // Store promo banners from SVGs
  await render('assets/promo-marquee.svg', 'assets/promo-marquee.png', 1400, 560);
  await render('assets/promo-small.svg', 'assets/promo-small.png', 440, 280);

  // Keep public/icon.svg up to date
  fs.copyFileSync('assets/icon.svg', 'public/icon.svg');
  fs.copyFileSync('assets/icon.svg', 'public/icon/icon.svg');

  await browser.close();
  console.log('Done rendering all SVG assets!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
