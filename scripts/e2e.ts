// End to end check of the built extension against local mocks of the redeem pages
// (tests/fixtures/redeemMock*.html). Requests to the real redeem hosts are intercepted
// and answered with the mocks, so nothing reaches Garena or the global site.
// Run `pnpm build` first, then `pnpm e2e`.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type BrowserContext, chromium, type Page } from 'playwright';
import { looksLikeCode } from '../src/lib/feed.ts';
import { collectCodeTokens } from '../src/lib/pageScan.ts';

const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION = resolve(ROOT, '.output/chrome-mv3');
const GARENA_URL = 'https://redeem.df.garena.sg/vi/cdkgarena.html';
const GLOBAL_URL = 'https://www.playdeltaforce.com/en/cdkredeem.html';
const MOCK_GARENA = await readFile(resolve(ROOT, 'tests/fixtures/redeemMock.html'), 'utf8');
const MOCK_GLOBAL = await readFile(resolve(ROOT, 'tests/fixtures/redeemMockGlobal.html'), 'utf8');
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
  siteId?: string;
  pauseReason?: string;
  items: { code: string; status: string; message?: string }[];
};
type StorageDump = {
  jobs?: Record<string, JobSnapshot>;
  drafts?: Record<string, string>;
  inbox?: string[];
  history?: { siteId?: string }[];
  knownCodes?: Record<string, Record<string, string>>;
  settings?: Record<string, unknown>;
  job?: unknown;
  draft?: unknown;
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
    locale: 'vi-VN',
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const html = (body: string) => ({ status: 200, contentType: 'text/html; charset=utf-8', body });
  await context.route('https://redeem.df.garena.sg/**', (route) =>
    route.fulfill(html(MOCK_GARENA)),
  );
  await context.route('https://www.playdeltaforce.com/**', (route) =>
    route.fulfill(html(MOCK_GLOBAL)),
  );
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const site = await context.newPage();
  await site.goto(GARENA_URL);
  return { context, extensionId };
}

async function openPanel(context: BrowserContext, extensionId: string) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByText('Tester').first().waitFor();
  return panel;
}

// Runs inside the extension page, where the chrome global exists
type ChromeStorage = {
  chrome: {
    storage: {
      local: { get(key: null): Promise<StorageDump>; set(items: object): Promise<void> };
    };
  };
};

function dump(panel: Page): Promise<StorageDump> {
  return panel.evaluate(() =>
    (globalThis as unknown as ChromeStorage).chrome.storage.local.get(null),
  );
}

function setStorage(panel: Page, items: object): Promise<void> {
  return panel.evaluate(
    (data) => (globalThis as unknown as ChromeStorage).chrome.storage.local.set(data),
    items,
  );
}

async function waitForJob(panel: Page, siteId: string, until: (job: JobSnapshot) => boolean) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const job = (await dump(panel)).jobs?.[siteId];
    if (job && until(job)) return job;
    await panel.waitForTimeout(500);
  }
  throw new Error(`Job on ${siteId} did not reach the expected state in time`);
}
const stopped = (job: JobSnapshot) => job.status !== 'running';

async function migrationPhase() {
  // 0. Data saved by the single site version is moved under Delta Force Garena
  const profile = await mkdtemp(join(tmpdir(), 'gcr-e2e-legacy-'));
  try {
    const { context, extensionId } = await launch(profile);
    let panel = await openPanel(context, extensionId);
    await setStorage(panel, {
      settings: {
        mode: 'semi',
        delayMs: 3000,
        skipKnown: true,
        maskFinishedCodes: false,
        notify: false,
        autoSyncFeed: false,
        feedUrl: 'https://feed.example.test/feed/codes.json',
      },
      knownCodes: { Tester: { abc: 'used' } },
      job: {
        id: 'legacy',
        tabId: 1,
        account: 'Tester',
        mode: 'semi',
        status: 'done',
        items: [{ code: 'LEGACY01', status: 'used' }],
        createdAt: 1,
        finishedAt: 2,
      },
      draft: 'LEGACY02',
    });
    await panel.close();
    panel = await openPanel(context, extensionId);
    await panel.waitForTimeout(500);
    const stored = await dump(panel);
    check(stored.settings?.activeSite === 'df-garena', 'legacy settings get a site');
    check(
      stored.settings?.feedBaseUrl === 'https://feed.example.test/feed/' &&
        !('feedUrl' in (stored.settings ?? {})),
      `legacy feed URL becomes a folder (${stored.settings?.feedBaseUrl})`,
    );
    check(
      !!stored.knownCodes?.['df-garena:Tester'] && !stored.knownCodes?.Tester,
      'legacy known codes move to Garena',
    );
    check(
      stored.jobs?.['df-garena']?.items[0]?.code === 'LEGACY01' && stored.job === undefined,
      'legacy job moves to Garena',
    );
    check(
      stored.drafts?.['df-garena'] === 'LEGACY02' && stored.draft === undefined,
      'legacy draft moves to Garena',
    );
    await context.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

async function mainPhase() {
  const profile = await mkdtemp(join(tmpdir(), 'gcr-e2e-'));
  try {
    // 1. Run a batch on Garena; all valid codes are taken into the job
    let { context, extensionId } = await launch(profile);
    let panel = await openPanel(context, extensionId);
    await panel.fill('textarea', [...Object.keys(EXPECTED), ...OVERFLOW].join('\n'));
    await panel.check('input[type=checkbox]');
    await panel.getByRole('button', { name: /Bắt đầu đổi 57 code/ }).click();
    // Stop after the expected codes to keep the run short
    await waitForJob(panel, 'df-garena', (job) =>
      Object.keys(EXPECTED).every((code) => {
        const status = job.items.find((i) => i.code === code)?.status;
        return status !== undefined && status !== 'pending' && status !== 'inFlight';
      }),
    );
    await panel.getByRole('button', { name: 'Kết thúc' }).click();
    await panel.getByRole('button', { name: 'Chắc chắn?' }).click();
    const result = await waitForJob(panel, 'df-garena', stopped);
    check(
      result.status === 'done' && result.siteId === 'df-garena',
      `Garena job ended (${result.status})`,
    );
    for (const code of Object.keys(EXPECTED)) {
      const item = result.items.find((i) => i.code === code);
      check(item?.status === EXPECTED[code], `${code} is ${item?.status} (want ${EXPECTED[code]})`);
    }
    let stored = await dump(panel);
    const draftText = stored.drafts?.['df-garena'] ?? '';
    check(draftText === '', 'draft is cleared when running full batch');

    // 2. Reload the side panel: job and history are still there, remaining codes can be continued
    await panel.close();
    panel = await openPanel(context, extensionId);
    check(
      await panel.getByText(/Chạy tiếp \d+ code còn lại/).isVisible(),
      'continue remaining offered',
    );

    // 3. Restart the whole browser with the same profile
    await context.close();
    ({ context, extensionId } = await launch(profile));
    panel = await openPanel(context, extensionId);
    stored = await dump(panel);
    check(
      stored.history?.length === 1 && stored.history[0]?.siteId === 'df-garena',
      'history survives restart',
    );
    check(
      Object.keys(stored.knownCodes?.['df-garena:Tester'] ?? {}).length === 5,
      'known codes survive restart',
    );
    check(stored.jobs?.['df-garena']?.status === 'done', 'last job survives restart');

    // 4. The same codes are now skipped as already processed
    await panel.fill('textarea', Object.keys(EXPECTED).join('\n'));
    await panel.getByText('Bỏ qua 5 đã xử lý').waitFor({ timeout: 5000 });
    check(true, 'known codes skipped on the next run');

    // 5. Codes sent by the context menu land in the inbox and get merged into the draft
    await setStorage(panel, { inbox: ['FROMMENU01'] });
    await panel.waitForFunction(() =>
      document.querySelector('textarea')?.value.includes('FROMMENU01'),
    );
    check((await dump(panel)).inbox?.length === 0, 'context menu inbox merged into draft');

    // 6. Semi auto waits for a click; switching to auto mid job sends the waiting code
    await panel.getByRole('button', { name: /Bán tự động/ }).click();
    await panel.fill('textarea', 'SEMI0001\nSEMI0002');
    await panel.check('input[type=checkbox]');
    await panel.getByRole('button', { name: /Bắt đầu đổi 2 code/ }).click();
    await panel.getByText('Hãy bấm nút').waitFor({ timeout: 10_000 });
    await panel.getByRole('button', { name: /^Tự động/ }).click();
    const switched = await waitForJob(panel, 'df-garena', stopped);
    check(
      switched.status === 'done' && switched.items.every((i) => i.status === 'success'),
      `switching semi to auto mid job finishes it (${switched.items.map((i) => i.status).join(',')})`,
    );

    // 7. Feed sync reads this site's file; known and expired codes are skipped
    const today = new Date().toISOString().slice(0, 10);
    const entry = { firstSeen: today, lastSeen: today, sources: ['test'] };
    const feedBody = (codes: Record<string, object>) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 1, updatedAt: today, codes }),
    });
    await context.route('https://feed.example.test/df-garena.json', (route) =>
      route.fulfill(
        feedBody({
          OKCODE01: entry,
          FEED0001: entry,
          FEED0002: entry,
          GONE0001: { ...entry, expired: true },
        }),
      ),
    );
    await context.route('https://feed.example.test/df-global.json', (route) =>
      route.fulfill(feedBody({ GFEED001: entry })),
    );
    await panel.fill('textarea', 'FEED0002');
    await panel.locator('nav button', { hasText: 'Cài đặt' }).click();
    await panel.fill('input[type=url]', 'https://feed.example.test/');
    await panel.getByRole('button', { name: 'Lưu và lấy code' }).click();
    await panel.getByText(/Thêm 1, bỏ qua 1 đã xử lý/).waitFor({ timeout: 10_000 });
    const garenaDraft = (await dump(panel)).drafts?.['df-garena'] ?? '';
    check(
      garenaDraft.split('\n').sort().join(',') === 'FEED0001,FEED0002',
      `Garena feed adds only new codes (${garenaDraft.split('\n').join(',')})`,
    );

    // 8. Switch to the Global server: its own draft, feed, job and known codes
    const globalTab = await context.newPage();
    await globalTab.goto(GLOBAL_URL);
    await panel.bringToFront();
    await panel.selectOption('#site-select', 'df-global');
    await panel.locator('nav button', { hasText: 'Đổi code' }).click();
    await panel.getByText('Tester').first().waitFor();
    // Auto sync may already have pulled df-global.json; Garena codes must never show up here
    const globalDraft = await panel.inputValue('textarea');
    check(
      !/FEED000|EXTRA|SEMI/.test(globalDraft),
      `Global has its own draft (${globalDraft || 'empty'})`,
    );
    await panel.getByRole('button', { name: 'Lấy code mới' }).click();
    await panel.getByText(/Nguồn có 1 code còn mới/).waitFor({ timeout: 10_000 });
    check((await panel.inputValue('textarea')) === 'GFEED001', 'Global reads df-global.json');
    await panel.fill('textarea', 'GOK00001\nGUSED001\nGBAD0001');
    await panel.check('input[type=checkbox]');
    await panel.getByRole('button', { name: /Bắt đầu đổi 3 code/ }).click();
    const globalJob = await waitForJob(panel, 'df-global', stopped);
    check(
      globalJob.items.map((i) => i.status).join(',') === 'success,used,invalid',
      `Global job results (${globalJob.items.map((i) => i.status).join(',')})`,
    );
    stored = await dump(panel);
    check(
      Object.keys(stored.knownCodes?.['df-global:Tester'] ?? {}).length === 3,
      'Global known codes kept apart',
    );
    check(stored.jobs?.['df-garena']?.items.length === 2, 'Garena job untouched by Global run');

    // 9. Page scan (context menu): only code cards are picked, not nav links or words
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

    // 10. Switching the language changes the UI and is remembered
    await panel.bringToFront();
    await panel.locator('nav button', { hasText: 'Cài đặt' }).click();
    await panel.selectOption('#language', 'en');
    await panel.locator('nav button', { hasText: 'Redeem' }).waitFor({ timeout: 5000 });
    check((await dump(panel)).settings?.locale === 'en', 'language switch to English is saved');
    await context.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

try {
  await migrationPhase();
  await mainPhase();
} catch (error) {
  failed = true;
  console.error(error);
}
process.exit(failed ? 1 : 0);
