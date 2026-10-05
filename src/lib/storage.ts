import { storage } from '#imports';
import type { Job, ResultStatus, RunMode, StatusCounts } from './job';

export interface Settings {
  mode: RunMode;
  /** Delay between submits in auto mode. Never lower than MIN_DELAY_MS. */
  delayMs: number;
  /** Skip codes that already got a final result on the same account. */
  skipKnown: boolean;
  /** Mask codes with a final result once a job is done. Pending and unknown stay readable. */
  maskFinishedCodes: boolean;
  /** Desktop notification when a job finishes or pauses on its own. */
  notify: boolean;
  /** Public JSON feed of codes (feed/codes.json from the scraper repo). Empty disables it. */
  feedUrl: string;
  /** Pull the feed when the side panel opens, at most every FEED_AUTO_SYNC_MS. */
  autoSyncFeed: boolean;
}

export interface FeedSync {
  at: number;
  /** Codes in the feed that are recent and not expired. */
  active: number;
  /** Codes added to the code box by that sync. */
  added: number;
}

export const FEED_AUTO_SYNC_MS = 6 * 60 * 60 * 1000;
/** Only codes a source still listed within this many days are pulled. */
export const FEED_MAX_AGE_DAYS = 60;

export interface HistoryEntry {
  id: string;
  account: string;
  mode: RunMode;
  startedAt: number;
  finishedAt: number;
  total: number;
  counts: StatusCounts;
}

/** account name, then SHA 256 of the code, then the final result on that account. */
export type KnownCodes = Record<string, Record<string, ResultStatus>>;

// The site drops new toasts for about 2.2 s while one is showing
export const MIN_DELAY_MS = 3000;
export const MAX_HISTORY = 30;

// Only the side panel (orchestrator) writes these, other contexts read or watch them
export const jobItem = storage.defineItem<Job | null>('local:job', { fallback: null });

export const knownCodesItem = storage.defineItem<KnownCodes>('local:knownCodes', {
  fallback: {},
});

export const historyItem = storage.defineItem<HistoryEntry[]>('local:history', { fallback: [] });

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: {
    mode: 'auto',
    delayMs: 5000,
    skipKnown: true,
    maskFinishedCodes: false,
    notify: true,
    feedUrl: '',
    autoSyncFeed: true,
  },
});

export const feedSyncItem = storage.defineItem<FeedSync | null>('local:feedSync', {
  fallback: null,
});

/** Unsent text in the code box, so closing the side panel does not lose it. */
export const draftItem = storage.defineItem<string>('local:draft', { fallback: '' });

/** Codes sent from the page context menu, merged into the draft by the side panel. */
export const inboxItem = storage.defineItem<string[]>('local:inbox', { fallback: [] });

export interface Backup {
  app: 'gift-code-redeemer';
  version: 1;
  exportedAt: number;
  settings: Settings;
  knownCodes: KnownCodes;
  history: HistoryEntry[];
}

/** Light shape check for an imported backup; rejects anything that is not ours. */
export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'gift-code-redeemer' || data.version !== 1) {
    throw new Error('File không phải bản sao lưu của extension này');
  }
  if (!data.knownCodes || typeof data.knownCodes !== 'object' || !Array.isArray(data.history)) {
    throw new Error('Bản sao lưu bị thiếu dữ liệu');
  }
  return {
    app: 'gift-code-redeemer',
    version: 1,
    exportedAt: Number(data.exportedAt) || Date.now(),
    settings: {
      ...settingsItem.fallback,
      ...data.settings,
      delayMs: clampDelay(Number(data.settings?.delayMs) || settingsItem.fallback.delayMs),
    },
    knownCodes: data.knownCodes,
    history: data.history.slice(0, MAX_HISTORY),
  };
}

export function clampDelay(ms: number): number {
  return Math.max(MIN_DELAY_MS, ms);
}
