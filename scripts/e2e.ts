// End to end check of the built extension against tests/fixtures/redeemMock.html.
// Requests to the real redeem host are intercepted and answered with the mock, so
// nothing reaches Garena. Run `pnpm build` first, then `pnpm e2e`.
//
// Covers: a full auto run, the draft keeping codes past the batch, data surviving a
// side panel reload and a full browser restart, and known codes being skipped.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type BrowserContext, chromium, type Page } from 'playwright';
import { looksLikeCode } from '../src/lib/feed.ts';
import { collectCodeTokens } from '../src/lib/pageScan.ts';

const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION = resolve(ROOT, '.output/chrome-mv3');
const MOCK = await readFile(resolve(ROOT, 'tests/fixtures/redeemMock.html'), 'utf8');
const EXPECTED: Record<string, string> = {
  OKCODE01: 'success',
  USED0001: 'used',
  BAD00001: 'invalid',
  LIMIT001: 'used',
  OKCODE02: 'success',
};
// More than one batch, so the draft must keep the overflow
const OVERFLOW = Array.from({ length: 52 }, (_, i) => `EXTRA${String(i).padStart(3, '0')}`);

type JobSnapshot = {
  status: string;
  pauseReason?: string;
  items: { code: string; status: string; message?: string }[];
};
type StorageDump = {
  job?: JobSnapshot;
  draft?: string;
  inbox?: string[];
  history?: unknown[];
  knownCodes?: Record<string, Record<string, string>>;
};

let failed = false;
function check(ok: boolean, label: string) {
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

async function launch(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await context.route('https://redeem.df.garena.sg/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }),
  );
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const site = await context.newPage();
  await site.goto('https://redeem.df.garena.sg/vi/cdkgarena.html');
  return { context, extensionId };
}

async function openPanel(context: BrowserContext, extensionId: string) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByText('Tester').waitFor();
  return panel;
}

function dump(panel: Page): Promise<StorageDump> {
  return panel.evaluate(async () => {
    // Runs inside the extension page, where the chrome global exists
    const ext = globalThis as unknown as {
      chrome: { storage: { local: { get(key: null): Promise<StorageDump> } } };
    };
    return ext.chrome.storage.local.get(null);
  });
}

async function waitForJob(panel: Page): Promise<JobSnapshot> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { job } = await dump(panel);
    if (job && job.status !== 'running') return job;
    await panel.waitForTimeout(500);
  }
  throw new Error('Job did not finish within 60 s');
}

const profile = await mkdtemp(join(tmpdir(), 'gcr-e2e-'));
try {
  // 1. Run a batch; codes past the batch limit stay in the draft
  let { context, extensionId } = await launch(profile);
  let panel = await openPanel(context, extensionId);
  await panel.fill('textarea', [...Object.keys(EXPECTED), ...OVERFLOW].join('\n'));
  await panel.check('input[type=checkbox]');
  await panel.getByRole('button', { name: /Bắt đầu đổi 50 code/ }).click();
  // Stop after the expected codes to keep the run short
  const result = await (async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const { job } = await dump(panel);
      const done = job?.items.filter(
        (i) => i.code in EXPECTED && i.status !== 'pending' && i.status !== 'inFlight',
      );
      if (done?.length === Object.keys(EXPECTED).length) {
        await panel.getByRole('button', { name: 'Kết thúc' }).click();
        await panel.getByRole('button', { name: 'Chắc chắn?' }).click();
        return waitForJob(panel);
      }
      await panel.waitForTimeout(500);
    }
    throw new Error('Expected codes were not processed in time');
  })();
  check(result.status === 'done', `job ended (${result.status})`);
  for (const code of Object.keys(EXPECTED)) {
    const item = result.items.find((i) => i.code === code);
    check(item?.status === EXPECTED[code], `${code} is ${item?.status} (want ${EXPECTED[code]})`);
  }
  let stored = await dump(panel);
  check(
    stored.draft?.split('\n').length === 7,
    `draft keeps ${stored.draft?.split('\n').length} overflow codes (want 7)`,
  );

  // 2. Reload the side panel: draft, job and history are still there
  await panel.close();
  panel = await openPanel(context, extensionId);
  check(
    (await panel.inputValue('textarea')).includes('EXTRA051'),
    'draft shown after panel reload',
  );
  check(
    await panel.getByText(/Chạy tiếp \d+ code còn lại/).isVisible(),
    'continue remaining offered',
  );

  // 3. Restart the whole browser with the same profile
  await context.close();
  ({ context, extensionId } = await launch(profile));
  panel = await openPanel(context, extensionId);
  stored = await dump(panel);
  check(stored.history?.length === 1, `history survives restart (${stored.history?.length})`);
  check(Object.keys(stored.knownCodes?.Tester ?? {}).length === 5, 'known codes survive restart');
  check(stored.job?.status === 'done', 'last job survives restart');

  // 4. The same codes are now skipped as already processed
  await panel.fill('textarea', Object.keys(EXPECTED).join('\n'));
  await panel.getByText('Bỏ qua 5 đã xử lý').waitFor({ timeout: 5000 });
  check(true, 'known codes skipped on the next run');

  // 5. Codes sent by the context menu land in the inbox and get merged into the draft
  await panel.evaluate(async () => {
    const ext = globalThis as unknown as {
      chrome: { storage: { local: { set(items: object): Promise<void> } } };
    };
    await ext.chrome.storage.local.set({ inbox: ['FROMMENU01'] });
  });
  await panel.waitForFunction(() =>
    document.querySelector('textarea')?.value.includes('FROMMENU01'),
  );
  check((await dump(panel)).inbox?.length === 0, 'context menu inbox merged into draft');

  // 6. A job started in semi auto mode waits for a click; switching to auto mid job
  //    sends the waiting code without the user touching the page
  await panel.getByRole('button', { name: /Bán tự động/ }).click();
  await panel.fill('textarea', 'SEMI0001\nSEMI0002');
  await panel.check('input[type=checkbox]');
  await panel.getByRole('button', { name: /Bắt đầu đổi 2 code/ }).click();
  await panel.getByText('Hãy bấm nút').waitFor({ timeout: 10_000 });
  await panel.getByRole('button', { name: /^Tự động/ }).click();
  const switched = await waitForJob(panel);
  check(
    switched.status === 'done' && switched.items.every((i) => i.status === 'success'),
    `switching semi to auto mid job finishes it (${switched.items.map((i) => i.status).join(',')})`,
  );

  // 7. Feed sync: known and expired codes are skipped, codes already in the box are not doubled
  const today = new Date().toISOString().slice(0, 10);
  const entry = { firstSeen: today, lastSeen: today, sources: ['test'] };
  await context.route('https://feed.example.test/codes.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        updatedAt: today,
        codes: {
          OKCODE01: entry,
          FEED0001: entry,
          FEED0002: entry,
          GONE0001: { ...entry, expired: true },
        },
      }),
    }),
  );
  await panel.fill('textarea', 'FEED0002');
  await panel.locator('nav button', { hasText: 'Cài đặt' }).click();
  await panel.fill('input[type=url]', 'https://feed.example.test/codes.json');
  await panel.getByRole('button', { name: 'Lưu và lấy code' }).click();
  await panel.getByText(/Thêm 1, bỏ qua 1 đã xử lý/).waitFor({ timeout: 10_000 });
  const draft = (await dump(panel)).draft ?? '';
  check(
    draft.split('\n').sort().join(',') === 'FEED0001,FEED0002',
    `feed adds only new codes (${draft.split('\n').join(',')})`,
  );

  // 8. Page scan (context menu): only code cards are picked, not nav links or words
  await context.route('https://codes.example.test/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><body>
        <nav><a href="/">Download</a><a href="/">JavaScript</a></nav>
        <h1>Gift Code Delta Force</h1>
        <div class="card"><span class="code">DFharbor738</span><button>Sao chép</button></div>
        <div class="card"><div><strong>WELCOMETODF</strong></div><p>Hết hạn 25/10</p></div>
        <div class="card"><span>TrickOrTreat</span></div>
        <p>Nhập code tại trang redeem, Delta Force rất hay</p>
        <footer><span>COPYRIGHT2026</span></footer>
      </body>`,
    }),
  );
  const codesPage = await context.newPage();
  await codesPage.goto('https://codes.example.test/');
  const tokens = (await codesPage.evaluate(collectCodeTokens)).filter(looksLikeCode);
  check(
    tokens.sort().join(',') === 'DFharbor738,TrickOrTreat,WELCOMETODF',
    `page scan picks only codes (${tokens.join(',')})`,
  );
  await context.close();
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await rm(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
