import { appendToDraft, hashCode, maskCode } from '@/lib/codes';
import { activeCodes, parseFeed } from '@/lib/feed';
import {
  countByStatus,
  createJob,
  isTerminal,
  type Job,
  type JobItem,
  nextPendingIndex,
  type PauseReason,
  type ResultStatus,
  type RunMode,
  recoverInterrupted,
  requeue,
  transition,
} from '@/lib/job';
import { PAUSE_LABEL } from '@/lib/labels';
import { isNotDelivered, type ProbeResult, type RedeemOutcome, sendToTab } from '@/lib/messages';
import { garenaDf } from '@/lib/sites/garenaDf';
import {
  type Backup,
  clampDelay,
  draftItem,
  FEED_AUTO_SYNC_MS,
  FEED_MAX_AGE_DAYS,
  type FeedSync,
  feedSyncItem,
  type HistoryEntry,
  historyItem,
  inboxItem,
  jobItem,
  type KnownCodes,
  knownCodesItem,
  MAX_HISTORY,
  MIN_DELAY_MS,
  parseBackup,
  type Settings,
  settingsItem,
} from '@/lib/storage';

const SITE = garenaDf;
/** How long semi auto mode waits for the user to press the site's button. */
const ARM_TIMEOUT_MS = 5 * 60 * 1000;
const RESULT_STATUSES: readonly string[] = ['success', 'invalid', 'used', 'expired'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Owns the redeem loop. Lives in the side panel, which stays alive while it is open,
 * unlike the MV3 service worker. Every state change is persisted so a closed panel
 * can be recovered with recoverInterrupted().
 */
export class Runner {
  job = $state<Job | null>(null);
  settings = $state<Settings>(settingsItem.fallback);
  history = $state<HistoryEntry[]>([]);
  known = $state<KnownCodes>({});
  probe = $state<ProbeResult | null>(null);
  tabError = $state('');
  /** Semi auto mode is waiting for the user to click on the page. */
  waitingForUser = $state(false);
  countdownMs = $state(0);
  currentIndex = $state(-1);
  /** Unsent content of the code box, persisted so closing the panel keeps it. */
  draft = $state('');
  feedSync = $state<FeedSync | null>(null);
  feedBusy = $state(false);

  counts = $derived(countByStatus(this.job?.items ?? []));
  isActive = $derived(this.job !== null && this.job.status !== 'done');

  #looping = false;
  #draftTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while a semi auto wait is cancelled only to switch mode, so the loop keeps going. */
  #switchingMode = false;

  async init(): Promise<void> {
    const [job, settings, history, known, draft] = await Promise.all([
      jobItem.getValue(),
      settingsItem.getValue(),
      historyItem.getValue(),
      knownCodesItem.getValue(),
      draftItem.getValue(),
    ]);
    // Fill in fields added after the settings were first saved
    this.settings = { ...settingsItem.fallback, ...settings };
    this.draft = draft;
    this.feedSync = await feedSyncItem.getValue();
    this.history = history;
    this.known = known;
    if (job) {
      this.job = recoverInterrupted(job);
      if (this.job !== job) await this.#saveJob();
      else this.#updateBadge();
    }

    await this.#takeInbox();
    inboxItem.watch(() => void this.#takeInbox());

    browser.tabs.onRemoved.addListener((tabId) => {
      if (this.job?.tabId === tabId && this.job.status === 'running') this.#pause('tab_lost');
    });
    browser.tabs.onActivated.addListener(() => void this.refreshProbe());
    browser.tabs.onUpdated.addListener((_id, info) => {
      if (info.status === 'complete') void this.refreshProbe();
    });
    await this.refreshProbe();
    const stale = !this.feedSync || Date.now() - this.feedSync.at > FEED_AUTO_SYNC_MS;
    if (this.settings.feedUrl && this.settings.autoSyncFeed && stale) void this.syncFeed();
  }

  /** Finds the redeem tab: the active one if it is a redeem page, otherwise the first one open. */
  async findTab(): Promise<number | undefined> {
    const tabs = await browser.tabs.query({ url: `https://${SITE.hostname}/*` });
    return (tabs.find((tab) => tab.active) ?? tabs[0])?.id;
  }

  async refreshProbe(): Promise<void> {
    const tabId = await this.findTab();
    if (tabId === undefined) {
      this.probe = null;
      this.tabError = 'Chưa mở trang redeem';
      return;
    }
    try {
      this.probe = await sendToTab(tabId, { type: 'probe' });
      this.tabError = '';
    } catch {
      this.probe = null;
      this.tabError = 'Hãy tải lại trang redeem';
    }
  }

  async openRedeemPage(): Promise<void> {
    const tabId = await this.findTab();
    if (tabId !== undefined) await browser.tabs.update(tabId, { active: true });
    else await browser.tabs.create({ url: `https://${SITE.hostname}/vi/cdkgarena.html` });
  }

  knownFor(account: string): Record<string, ResultStatus> {
    return this.known[account] ?? {};
  }

  /** Splits codes into ones never seen on this account and ones that already have a result. */
  async splitKnown(codes: string[], account: string) {
    const seen = this.knownFor(account);
    const fresh: string[] = [];
    const known: string[] = [];
    for (const code of codes) {
      (seen[await hashCode(code)] ? known : fresh).push(code);
    }
    return { fresh, known };
  }

  async start(codes: string[]): Promise<string | null> {
    await this.refreshProbe();
    const tabId = await this.findTab();
    if (tabId === undefined || !this.probe) return this.tabError || 'Chưa mở trang redeem';
    if (!this.probe.loggedIn) return 'Hãy đăng nhập trên trang redeem trước';
    if (codes.length === 0) return 'Không có code nào để chạy';

    const job = createJob(codes, tabId, this.probe.account, this.settings.mode);
    this.job = { ...job, status: 'running', pauseReason: undefined };
    await this.#saveJob();
    await browser.tabs.update(tabId, { active: true });
    void this.#loop();
    return null;
  }

  async resume(): Promise<void> {
    if (this.job?.status !== 'paused') return;
    const tabId = await this.findTab();
    if (tabId === undefined) {
      this.tabError = 'Chưa mở trang redeem';
      return;
    }
    this.job.tabId = tabId;
    this.job.status = 'running';
    this.job.pauseReason = undefined;
    this.job.pauseDetail = undefined;
    await this.#saveJob();
    await browser.tabs.update(tabId, { active: true });
    void this.#loop();
  }

  pause(): void {
    this.#pause('user');
  }

  async stop(): Promise<void> {
    if (!this.job || this.job.status === 'done') return;
    await this.#disarm();
    await this.#finish();
  }

  async clearJob(): Promise<void> {
    if (this.job?.status === 'running') return;
    this.job = null;
    await jobItem.setValue(null);
  }

  /** User checked the site and wants to try an unknown code again. */
  async requeueItem(index: number): Promise<void> {
    const item = this.job?.items[index];
    if (!this.job || !item) return;
    this.job.items[index] = requeue(item);
    if (this.job.status === 'done') {
      this.job.status = 'paused';
      this.job.pauseReason = 'user';
      this.job.finishedAt = undefined;
    }
    await this.#saveJob();
  }

  /** User checked the site and records the real result of an unknown code. */
  async resolveItem(index: number, status: ResultStatus): Promise<void> {
    const item = this.job?.items[index];
    if (!this.job || !item) return;
    this.job.items[index] = transition(item, status, item.message);
    await this.#remember(this.job.account, item.code, status);
    await this.#saveJob();
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings, ...patch };
    next.delayMs = clampDelay(next.delayMs);
    this.settings = next;
    await settingsItem.setValue($state.snapshot(next));
  }

  async forgetKnown(account?: string): Promise<void> {
    if (account === undefined) this.known = {};
    else delete this.known[account];
    await knownCodesItem.setValue($state.snapshot(this.known));
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await historyItem.setValue([]);
  }

  async wipeAll(): Promise<void> {
    if (this.job?.status === 'running') return;
    this.job = null;
    this.known = {};
    this.history = [];
    await Promise.all([
      jobItem.setValue(null),
      knownCodesItem.setValue({}),
      historyItem.setValue([]),
    ]);
  }

  /**
   * Changes the mode, also for the job in progress. When semi auto mode is waiting for
   * the user to click, that wait is cancelled and the same code is sent again in auto mode.
   */
  async setMode(mode: RunMode): Promise<void> {
    await this.saveSettings({ mode });
    if (!this.job || this.job.status === 'done' || this.job.mode === mode) return;
    this.job.mode = mode;
    await this.#saveJob();
    if (this.waitingForUser) {
      this.#switchingMode = true;
      await this.#disarm();
    }
  }

  /**
   * Pulls the public feed and adds codes to the code box. Duplicates are removed in
   * three places: the feed itself is keyed by code, codes already in the box are not
   * added twice, and codes with a result on this account (known hashes) are skipped.
   */
  async syncFeed(): Promise<string> {
    const url = this.settings.feedUrl.trim();
    if (!url) return 'Chưa cấu hình nguồn code trong Cài đặt';
    if (!/^https:\/\//.test(url)) return 'Nguồn code phải là link https';
    this.feedBusy = true;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return `Không tải được nguồn code (HTTP ${response.status})`;
      const feed = parseFeed(await response.text(), SITE.codeFormat);
      const codes = activeCodes(feed, FEED_MAX_AGE_DAYS);
      const { fresh, known } = await this.splitKnown(codes, this.probe?.account ?? '');
      const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
      const before = count(this.draft);
      await this.setDraft(appendToDraft(this.draft, fresh), true);
      this.feedSync = { at: Date.now(), active: codes.length, added: count(this.draft) - before };
      await feedSyncItem.setValue($state.snapshot(this.feedSync));
      return `Nguồn có ${codes.length} code còn mới. Thêm ${this.feedSync.added}, bỏ qua ${known.length} đã xử lý`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      this.feedBusy = false;
    }
  }

  /** Typing is debounced; programmatic changes (feed, import, start) pass immediate. */
  setDraft(value: string, immediate = false): Promise<void> {
    this.draft = value;
    clearTimeout(this.#draftTimer);
    if (immediate) return draftItem.setValue(value);
    this.#draftTimer = setTimeout(() => void draftItem.setValue(value), 300);
    return Promise.resolve();
  }

  /** Starts a new job with the codes a finished job never got to. */
  async continueRemaining(): Promise<string | null> {
    const codes = (this.job?.items ?? []).filter((i) => i.status === 'pending').map((i) => i.code);
    return this.start(codes);
  }

  /** Puts every unknown item back in the queue after the user checked them. */
  async requeueAllUnknown(): Promise<void> {
    if (!this.job || this.job.status === 'running') return;
    this.job.items = this.job.items.map((item) =>
      item.status === 'unknown' ? requeue(item) : item,
    );
    if (this.job.status === 'done') {
      this.job.status = 'paused';
      this.job.pauseReason = 'user';
      this.job.finishedAt = undefined;
    }
    await this.#saveJob();
  }

  exportBackup(): Backup {
    return {
      app: 'gift-code-redeemer',
      version: 1,
      exportedAt: Date.now(),
      settings: $state.snapshot(this.settings),
      knownCodes: $state.snapshot(this.known),
      history: $state.snapshot(this.history),
    };
  }

  /** Merges a backup: known codes are combined, history is deduped by id. */
  async importBackup(text: string): Promise<string> {
    const backup = parseBackup(text);
    for (const [account, codes] of Object.entries(backup.knownCodes)) {
      this.known[account] = { ...codes, ...this.knownFor(account) };
    }
    const ids = new Set(this.history.map((h) => h.id));
    this.history = [...this.history, ...backup.history.filter((h) => !ids.has(h.id))]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, MAX_HISTORY);
    this.settings = backup.settings;
    await Promise.all([
      knownCodesItem.setValue($state.snapshot(this.known)),
      historyItem.setValue($state.snapshot(this.history)),
      settingsItem.setValue($state.snapshot(this.settings)),
    ]);
    const total = Object.values(backup.knownCodes).reduce((n, c) => n + Object.keys(c).length, 0);
    return `Đã nhập ${total} code đã xử lý và ${backup.history.length} lượt lịch sử`;
  }

  async #takeInbox(): Promise<void> {
    const inbox = await inboxItem.getValue();
    if (inbox.length === 0) return;
    await inboxItem.setValue([]);
    await this.setDraft(appendToDraft(this.draft, inbox), true);
  }

  /** Toolbar badge: progress while running, "!" when a pause needs attention. */
  #updateBadge(): void {
    const job = this.job;
    let text = '';
    let color = '#0ff796';
    if (job?.status === 'running') {
      const done = job.items.filter((i) => isTerminal(i.status) || i.status === 'unknown').length;
      text = `${done}/${job.items.length}`.slice(0, 5);
    } else if (job?.status === 'paused' && job.pauseReason !== 'user') {
      text = '!';
      color = '#ffc53d';
    }
    void browser.action.setBadgeText({ text });
    void browser.action.setBadgeBackgroundColor({ color });
    void browser.action.setBadgeTextColor?.({ color: '#04140c' });
  }

  #notify(title: string, message: string): void {
    if (!this.settings.notify) return;
    browser.notifications
      .create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title,
        message,
      })
      .catch(() => undefined);
  }

  async #loop(): Promise<void> {
    if (this.#looping) return;
    this.#looping = true;
    try {
      while (this.job?.status === 'running') {
        const job = this.job;
        const index = nextPendingIndex(job);
        if (index === -1) {
          await this.#finish();
          break;
        }

        let probe: ProbeResult;
        try {
          probe = await sendToTab(job.tabId, { type: 'probe' });
          this.probe = probe;
        } catch {
          this.#pause('tab_lost');
          break;
        }
        if (!probe.loggedIn) {
          this.#pause('login_required');
          break;
        }
        if (probe.captcha) {
          this.#pause('captcha');
          break;
        }
        if (job.mode === 'auto' && !probe.visible) {
          this.#pause('tab_hidden');
          break;
        }

        const item = job.items[index] as JobItem;
        this.currentIndex = index;
        job.items[index] = transition(item, 'inFlight');
        await this.#saveJob();

        let outcome: RedeemOutcome;
        try {
          if (job.mode === 'auto') {
            outcome = await sendToTab(job.tabId, { type: 'redeem', code: item.code });
          } else {
            this.waitingForUser = true;
            outcome = await sendToTab(job.tabId, {
              type: 'arm',
              code: item.code,
              timeoutMs: ARM_TIMEOUT_MS,
            });
          }
        } catch (error) {
          // Not delivered means nothing was submitted, anything else may have been
          if (isNotDelivered(error)) {
            job.items[index] = transition(job.items[index] as JobItem, 'pending');
            this.#pause('tab_lost');
          } else {
            job.items[index] = transition(job.items[index] as JobItem, 'unknown', String(error));
            this.#pause('needs_review', 'Trang bị tải lại hoặc đóng khi đang chờ kết quả');
          }
          await this.#saveJob();
          break;
        } finally {
          this.waitingForUser = false;
          this.currentIndex = -1;
        }

        const current = job.items[index] as JobItem;
        if (outcome.phase === 'before_submit') {
          job.items[index] = transition(current, 'pending');
          if (outcome.error === 'cancelled' && this.#switchingMode) {
            // Nothing was submitted; retry the same code right away in the new mode
            this.#switchingMode = false;
            await this.#saveJob();
            continue;
          }
          if (outcome.error === 'cancelled') {
            if (job.status === 'running') this.#pause('user', 'Hết thời gian chờ bấm nút');
          } else if (outcome.error === 'captcha' || outcome.error === 'login_required') {
            this.#pause(outcome.error);
          } else {
            this.#pause('error', outcome.error);
          }
          await this.#saveJob();
          break;
        }

        if (RESULT_STATUSES.includes(outcome.status)) {
          const status = outcome.status as ResultStatus;
          job.items[index] = transition(current, status, outcome.message);
          await this.#remember(job.account, item.code, status);
          await this.#saveJob();
        } else {
          job.items[index] = transition(current, 'unknown', outcome.message);
          const reason: PauseReason =
            outcome.status === 'captcha'
              ? 'captcha'
              : outcome.status === 'rate_limited'
                ? 'rate_limited'
                : 'needs_review';
          this.#pause(reason, outcome.message || 'Trang không trả về thông báo');
          await this.#saveJob();
          break;
        }

        if (nextPendingIndex(job) !== -1) {
          // Semi auto still keeps the floor: the site drops toasts shown too close together
          await this.#wait(job.mode === 'auto' ? this.settings.delayMs : MIN_DELAY_MS);
        }
      }
    } finally {
      this.#looping = false;
      this.countdownMs = 0;
    }
  }

  async #wait(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (this.job?.status === 'running' && Date.now() < end) {
      this.countdownMs = end - Date.now();
      await sleep(Math.min(250, end - Date.now()));
    }
    this.countdownMs = 0;
  }

  #pause(reason: PauseReason, detail?: string): void {
    if (!this.job || this.job.status === 'done') return;
    this.job.status = 'paused';
    this.job.pauseReason = reason;
    this.job.pauseDetail = detail;
    if (reason === 'user') void this.#disarm();
    else
      this.#notify(
        'Đã tạm dừng',
        detail ? `${PAUSE_LABEL[reason]}. ${detail}` : PAUSE_LABEL[reason],
      );
    void this.#saveJob();
  }

  async #disarm(): Promise<void> {
    if (!this.job || !this.waitingForUser) return;
    await sendToTab(this.job.tabId, { type: 'disarm' }).catch(() => undefined);
  }

  async #finish(): Promise<void> {
    const job = this.job;
    if (!job) return;
    job.status = 'done';
    job.pauseReason = undefined;
    job.finishedAt = Date.now();
    if (this.settings.maskFinishedCodes) {
      job.items = job.items.map((item) =>
        isTerminal(item.status) ? { ...item, code: maskCode(item.code) } : item,
      );
    }
    const entry: HistoryEntry = {
      id: job.id,
      account: job.account,
      mode: job.mode,
      startedAt: job.createdAt,
      finishedAt: job.finishedAt,
      total: job.items.length,
      counts: countByStatus(job.items),
    };
    this.history = [entry, ...this.history.filter((h) => h.id !== job.id)].slice(0, MAX_HISTORY);
    this.#notify(
      'Đã xong lượt đổi code',
      `${entry.counts.success} thành công, ${entry.counts.used} đã dùng, ${entry.counts.invalid + entry.counts.expired} lỗi`,
    );
    await Promise.all([this.#saveJob(), historyItem.setValue($state.snapshot(this.history))]);
  }

  async #remember(account: string, code: string, status: ResultStatus): Promise<void> {
    const hash = await hashCode(code);
    this.known[account] = { ...this.knownFor(account), [hash]: status };
    await knownCodesItem.setValue($state.snapshot(this.known));
  }

  async #saveJob(): Promise<void> {
    this.#updateBadge();
    await jobItem.setValue(this.job ? $state.snapshot(this.job) : null);
  }
}

export const runner = new Runner();
