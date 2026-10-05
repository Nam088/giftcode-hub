import { appendToDraft, hashCode, maskCode } from '@/lib/codes';
import { activeCodes, parseFeed } from '@/lib/feed';
import type { MessageKey } from '@/lib/i18n/en';
import { getLocale, isMessageKey, type Msg, setLocale, t } from '@/lib/i18n/index.svelte';
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
import { isNotDelivered, type ProbeResult, type RedeemOutcome, sendToTab } from '@/lib/messages';
import { DEFAULT_SITE, getSite, isSiteId, type SiteAdapter, type SiteId } from '@/lib/sites';
import {
  type Backup,
  clampDelay,
  DEFAULT_SETTINGS,
  draftsItem,
  FEED_AUTO_SYNC_MS,
  FEED_MAX_AGE_DAYS,
  type FeedSync,
  feedSyncItem,
  feedUrlFor,
  type HistoryEntry,
  historyItem,
  inboxItem,
  jobsItem,
  type KnownCodes,
  knownCodesItem,
  knownKey,
  legacyDraftItem,
  legacyJobItem,
  MAX_HISTORY,
  MIN_DELAY_MS,
  type PerSite,
  parseBackup,
  type Settings,
  settingsItem,
} from '@/lib/storage';

/** How long semi auto mode waits for the user to press the site's button. */
const ARM_TIMEOUT_MS = 5 * 60 * 1000;
const RESULT_STATUSES: readonly string[] = ['success', 'invalid', 'used', 'expired'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const msg = (key: MessageKey, params?: Msg['params']): Msg => ({ key, params });

/**
 * Owns the redeem loop. Lives in the side panel, which stays alive while it is open,
 * unlike the MV3 service worker. Every state change is persisted so a closed panel
 * can be recovered with recoverInterrupted().
 *
 * Everything is kept per site (game + server): jobs, drafts, feed syncs and known codes,
 * so Delta Force Garena and Global never mix. Only one site can run at a time.
 */
export class Runner {
  settings = $state<Settings>(DEFAULT_SETTINGS);
  jobs = $state<PerSite<Job>>({});
  drafts = $state<PerSite<string>>({});
  feedSyncs = $state<PerSite<FeedSync>>({});
  history = $state<HistoryEntry[]>([]);
  known = $state<KnownCodes>({});
  probe = $state<ProbeResult | null>(null);
  tabError = $state<MessageKey | ''>('');
  /** Semi auto mode is waiting for the user to click on the page. */
  waitingForUser = $state(false);
  countdownMs = $state(0);
  currentIndex = $state(-1);
  feedBusy = $state(false);

  site: SiteAdapter = $derived(getSite(this.settings.activeSite));
  job: Job | null = $derived(this.jobs[this.settings.activeSite] ?? null);
  draft: string = $derived(this.drafts[this.settings.activeSite] ?? '');
  feedSync: FeedSync | null = $derived(this.feedSyncs[this.settings.activeSite] ?? null);
  counts = $derived(countByStatus(this.job?.items ?? []));
  /** The site whose job is running, if any; switching site is blocked meanwhile. */
  runningSite: SiteId | undefined = $derived(
    (Object.entries(this.jobs) as [SiteId, Job][]).find(([, j]) => j?.status === 'running')?.[0],
  );

  #looping = false;
  #draftTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while a semi auto wait is cancelled only to switch mode, so the loop keeps going. */
  #switchingMode = false;

  async init(): Promise<void> {
    const [settings, jobs, drafts, feedSyncs, history, known] = await Promise.all([
      settingsItem.getValue(),
      jobsItem.getValue(),
      draftsItem.getValue(),
      feedSyncItem.getValue(),
      historyItem.getValue(),
      knownCodesItem.getValue(),
    ]);
    // Fill in fields added after the settings were first saved
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    if (!isSiteId(this.settings.activeSite)) this.settings.activeSite = DEFAULT_SITE;
    setLocale(this.settings.locale);
    this.drafts = drafts;
    this.feedSyncs = feedSyncs;
    this.history = history;
    this.known = known;
    await this.#migrateLegacy(jobs);

    // A job found as running was interrupted (panel closed, browser restarted)
    let recovered = false;
    for (const [id, job] of Object.entries(jobs) as [SiteId, Job][]) {
      const next = recoverInterrupted(job);
      if (next !== job) recovered = true;
      jobs[id] = next;
    }
    this.jobs = jobs;
    if (recovered) await this.#saveJobs();
    else this.#updateBadge();

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
    this.#autoSync();
  }

  /** Moves pre split data (single job and draft) under Delta Force Garena, once. */
  async #migrateLegacy(jobs: PerSite<Job>): Promise<void> {
    const [legacyJob, legacyDraft] = await Promise.all([
      legacyJobItem.getValue(),
      legacyDraftItem.getValue(),
    ]);
    if (legacyJob && !jobs['df-garena']) {
      jobs['df-garena'] = { ...legacyJob, siteId: 'df-garena' };
      await jobsItem.setValue(jobs);
    }
    if (legacyDraft && !this.drafts['df-garena']) {
      this.drafts['df-garena'] = legacyDraft;
      await draftsItem.setValue($state.snapshot(this.drafts));
    }
    if (legacyJob) await legacyJobItem.removeValue();
    if (legacyDraft) await legacyDraftItem.removeValue();
  }

  /** Switches game or server. Blocked while another site is running. */
  async setSite(id: SiteId): Promise<void> {
    if (this.runningSite || id === this.settings.activeSite) return;
    await this.saveSettings({ activeSite: id });
    this.probe = null;
    await this.refreshProbe();
    this.#autoSync();
  }

  async setLanguage(preference: Settings['locale']): Promise<void> {
    setLocale(preference);
    await this.saveSettings({ locale: preference });
  }

  /** Finds the redeem tab: the active one if it is a redeem page, otherwise the first one open. */
  async findTab(): Promise<number | undefined> {
    const tabs = await browser.tabs.query({ url: this.site.matches });
    return (tabs.find((tab) => tab.active) ?? tabs[0])?.id;
  }

  async refreshProbe(): Promise<void> {
    const tabId = await this.findTab();
    if (tabId === undefined) {
      this.probe = null;
      this.tabError = 'conn.noTab';
      return;
    }
    try {
      this.probe = await sendToTab(tabId, { type: 'probe' });
      this.tabError = '';
    } catch {
      this.probe = null;
      this.tabError = 'conn.reload';
    }
  }

  async openRedeemPage(): Promise<void> {
    const tabId = await this.findTab();
    if (tabId !== undefined) await browser.tabs.update(tabId, { active: true });
    else await browser.tabs.create({ url: this.site.redeemUrl(getLocale()) });
  }

  knownFor(account: string, siteId: SiteId = this.site.id): Record<string, ResultStatus> {
    return this.known[knownKey(siteId, account)] ?? {};
  }

  /** Splits codes into ones never seen on this account and site and ones with a result. */
  async splitKnown(codes: string[], account: string) {
    const seen = this.knownFor(account);
    const fresh: string[] = [];
    const known: string[] = [];
    for (const code of codes) {
      (seen[await hashCode(code)] ? known : fresh).push(code);
    }
    return { fresh, known };
  }

  async start(codes: string[]): Promise<Msg | null> {
    if (this.runningSite) return msg('msg.otherRunning');
    await this.refreshProbe();
    const tabId = await this.findTab();
    if (tabId === undefined || !this.probe) return msg(this.tabError || 'msg.noTab');
    if (!this.probe.loggedIn) return msg('msg.notLoggedIn');
    if (codes.length === 0) return msg('msg.noCodes');

    const job = createJob(codes, tabId, this.probe.account, this.settings.mode, this.site.id);
    this.#setJob({ ...job, status: 'running', pauseReason: undefined });
    await this.#saveJobs();
    await browser.tabs.update(tabId, { active: true });
    void this.#loop();
    return null;
  }

  async resume(): Promise<void> {
    if (this.job?.status !== 'paused' || this.runningSite) return;
    const tabId = await this.findTab();
    if (tabId === undefined) {
      this.tabError = 'conn.noTab';
      return;
    }
    this.job.tabId = tabId;
    this.job.status = 'running';
    this.job.pauseReason = undefined;
    this.job.pauseDetail = undefined;
    this.job.pauseNote = undefined;
    await this.#saveJobs();
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
    this.#setJob(null);
    await this.#saveJobs();
  }

  /** User checked the site and wants to try an unknown code again. */
  async requeueItem(index: number): Promise<void> {
    const item = this.job?.items[index];
    if (!this.job || !item) return;
    this.job.items[index] = requeue(item);
    this.#reopenIfDone();
    await this.#saveJobs();
  }

  /** User checked the site and records the real result of an unknown code. */
  async resolveItem(index: number, status: ResultStatus): Promise<void> {
    const item = this.job?.items[index];
    if (!this.job || !item) return;
    this.job.items[index] = transition(item, status, item.message);
    await this.#remember(this.site.id, this.job.account, item.code, status);
    await this.#saveJobs();
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings, ...patch };
    next.delayMs = clampDelay(next.delayMs);
    this.settings = next;
    await settingsItem.setValue($state.snapshot(next));
  }

  /** Forgets known codes of one account on the active site, or everything. */
  async forgetKnown(account?: string): Promise<void> {
    if (account === undefined) this.known = {};
    else delete this.known[knownKey(this.site.id, account)];
    await knownCodesItem.setValue($state.snapshot(this.known));
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await historyItem.setValue([]);
  }

  async wipeAll(): Promise<void> {
    if (this.runningSite) return;
    this.jobs = {};
    this.known = {};
    this.history = [];
    this.feedSyncs = {};
    await Promise.all([
      jobsItem.setValue({}),
      knownCodesItem.setValue({}),
      historyItem.setValue([]),
      feedSyncItem.setValue({}),
    ]);
    this.#updateBadge();
  }

  /**
   * Changes the mode, also for the job in progress. When semi auto mode is waiting for
   * the user to click, that wait is cancelled and the same code is sent again in auto mode.
   */
  async setMode(mode: RunMode): Promise<void> {
    await this.saveSettings({ mode });
    if (!this.job || this.job.status === 'done' || this.job.mode === mode) return;
    this.job.mode = mode;
    await this.#saveJobs();
    if (this.waitingForUser) {
      this.#switchingMode = true;
      await this.#disarm();
    }
  }

  /**
   * Pulls the active site's feed and adds codes to its code box. Duplicates are removed in
   * three places: the feed itself is keyed by code, codes already in the box are not
   * added twice, and codes with a result on this account and site are skipped.
   */
  async syncFeed(): Promise<Msg> {
    const base = this.settings.feedBaseUrl.trim();
    if (!base) return msg('msg.feedNotSet');
    if (!/^https:\/\//.test(base)) return msg('msg.feedHttps');
    const site = this.site;
    this.feedBusy = true;
    try {
      const response = await fetch(feedUrlFor(base, site.feedKey), { cache: 'no-store' });
      if (!response.ok) return msg('msg.feedHttp', { status: response.status });
      const feed = parseFeed(await response.text(), site.codeFormat);
      const codes = activeCodes(feed, FEED_MAX_AGE_DAYS);
      const { fresh, known } = await this.splitKnown(codes, this.probe?.account ?? '');
      const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
      const before = count(this.draft);
      await this.setDraft(appendToDraft(this.draft, fresh), true);
      const sync = { at: Date.now(), active: codes.length, added: count(this.draft) - before };
      this.feedSyncs[site.id] = sync;
      await feedSyncItem.setValue($state.snapshot(this.feedSyncs));
      return msg('msg.feedResult', {
        active: codes.length,
        added: sync.added,
        known: known.length,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      return isMessageKey(text) ? msg(text) : msg('pause.error');
    } finally {
      this.feedBusy = false;
    }
  }

  /** Typing is debounced; programmatic changes (feed, import, start) pass immediate. */
  setDraft(value: string, immediate = false): Promise<void> {
    this.drafts[this.site.id] = value;
    clearTimeout(this.#draftTimer);
    const save = () => draftsItem.setValue($state.snapshot(this.drafts));
    if (immediate) return save();
    this.#draftTimer = setTimeout(() => void save(), 300);
    return Promise.resolve();
  }

  /** Starts a new job with the codes a finished job never got to. */
  async continueRemaining(): Promise<Msg | null> {
    const codes = (this.job?.items ?? []).filter((i) => i.status === 'pending').map((i) => i.code);
    return this.start(codes);
  }

  /** Puts every unknown item back in the queue after the user checked them. */
  async requeueAllUnknown(): Promise<void> {
    if (!this.job || this.job.status === 'running') return;
    this.job.items = this.job.items.map((item) =>
      item.status === 'unknown' ? requeue(item) : item,
    );
    this.#reopenIfDone();
    await this.#saveJobs();
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
  async importBackup(text: string): Promise<Msg> {
    const backup = parseBackup(text);
    for (const [key, codes] of Object.entries(backup.knownCodes)) {
      this.known[key] = { ...codes, ...this.known[key] };
    }
    const ids = new Set(this.history.map((h) => h.id));
    this.history = [...this.history, ...backup.history.filter((h) => !ids.has(h.id))]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, MAX_HISTORY);
    this.settings = backup.settings;
    setLocale(this.settings.locale);
    await Promise.all([
      knownCodesItem.setValue($state.snapshot(this.known)),
      historyItem.setValue($state.snapshot(this.history)),
      settingsItem.setValue($state.snapshot(this.settings)),
    ]);
    const total = Object.values(backup.knownCodes).reduce((n, c) => n + Object.keys(c).length, 0);
    return msg('msg.backupImported', { known: total, history: backup.history.length });
  }

  #setJob(job: Job | null): void {
    if (job) this.jobs[job.siteId ?? this.site.id] = job;
    else delete this.jobs[this.site.id];
  }

  #reopenIfDone(): void {
    if (this.job?.status !== 'done') return;
    this.job.status = 'paused';
    this.job.pauseReason = 'user';
    this.job.finishedAt = undefined;
  }

  #autoSync(): void {
    const stale = !this.feedSync || Date.now() - this.feedSync.at > FEED_AUTO_SYNC_MS;
    if (this.settings.feedBaseUrl && this.settings.autoSyncFeed && stale) void this.syncFeed();
  }

  async #takeInbox(): Promise<void> {
    const inbox = await inboxItem.getValue();
    if (inbox.length === 0) return;
    await inboxItem.setValue([]);
    await this.setDraft(appendToDraft(this.draft, inbox), true);
  }

  /** Toolbar badge: progress while running, "!" when a pause needs attention. */
  #updateBadge(): void {
    const jobs = Object.values(this.jobs) as Job[];
    const running = jobs.find((j) => j.status === 'running');
    let text = '';
    let color = '#0ff796';
    if (running) {
      const done = running.items.filter((i) => isTerminal(i.status) || i.status === 'unknown');
      text = `${done.length}/${running.items.length}`.slice(0, 5);
    } else if (jobs.some((j) => j.status === 'paused' && j.pauseReason !== 'user')) {
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
        title: `${title} · ${t(`site.${this.site.id}`)}`,
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
        const siteId = job.siteId ?? this.site.id;
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
        if (job.mode === 'auto' && !probe.visible && !this.settings.allowBackground) {
          this.#pause('tab_hidden');
          break;
        }

        const item = job.items[index] as JobItem;
        this.currentIndex = index;
        job.items[index] = transition(item, 'inFlight');
        await this.#saveJobs();

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
            this.#pause('needs_review', undefined, 'note.reloaded');
          }
          await this.#saveJobs();
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
            await this.#saveJobs();
            continue;
          }
          if (outcome.error === 'cancelled') {
            if (job.status === 'running') this.#pause('user', undefined, 'note.armTimeout');
          } else if (outcome.error === 'captcha' || outcome.error === 'login_required') {
            this.#pause(outcome.error);
          } else {
            const note = `note.${outcome.error}`;
            if (isMessageKey(note)) this.#pause('error', undefined, note);
            else this.#pause('error', outcome.error);
          }
          await this.#saveJobs();
          break;
        }

        if (RESULT_STATUSES.includes(outcome.status)) {
          const status = outcome.status as ResultStatus;
          job.items[index] = transition(current, status, outcome.message);
          await this.#remember(siteId, job.account, item.code, status);
          await this.#saveJobs();
        } else {
          job.items[index] = transition(current, 'unknown', outcome.message || t('note.noMessage'));
          const reason: PauseReason =
            outcome.status === 'captcha'
              ? 'captcha'
              : outcome.status === 'rate_limited'
                ? 'rate_limited'
                : 'needs_review';
          if (reason === 'needs_review' && this.settings.continueOnReview) {
            await this.#saveJobs();
          } else {
            if (outcome.message) this.#pause(reason, outcome.message);
            else this.#pause(reason, undefined, 'note.noMessage');
            await this.#saveJobs();
            break;
          }
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

  #pause(reason: PauseReason, detail?: string, note?: MessageKey): void {
    if (!this.job || this.job.status === 'done') return;
    this.job.status = 'paused';
    this.job.pauseReason = reason;
    this.job.pauseDetail = detail;
    this.job.pauseNote = note;
    if (reason === 'user') void this.#disarm();
    else {
      const extra = detail ?? (note ? t(note) : '');
      this.#notify(
        t('notify.paused'),
        extra ? `${t(`pause.${reason}`)}. ${extra}` : t(`pause.${reason}`),
      );
    }
    void this.#saveJobs();
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
      siteId: job.siteId ?? this.site.id,
      account: job.account,
      mode: job.mode,
      startedAt: job.createdAt,
      finishedAt: job.finishedAt,
      total: job.items.length,
      counts: countByStatus(job.items),
    };
    this.history = [entry, ...this.history.filter((h) => h.id !== job.id)].slice(0, MAX_HISTORY);
    this.#notify(
      t('notify.done'),
      t('notify.doneBody', {
        success: entry.counts.success,
        used: entry.counts.used,
        failed: entry.counts.invalid + entry.counts.expired,
      }),
    );
    await Promise.all([this.#saveJobs(), historyItem.setValue($state.snapshot(this.history))]);
  }

  async #remember(siteId: SiteId, account: string, code: string, status: ResultStatus) {
    const hash = await hashCode(code);
    const key = knownKey(siteId, account);
    this.known[key] = { ...this.known[key], [hash]: status };
    await knownCodesItem.setValue($state.snapshot(this.known));
  }

  async #saveJobs(): Promise<void> {
    this.#updateBadge();
    await jobsItem.setValue($state.snapshot(this.jobs));
  }
}

export const runner = new Runner();
