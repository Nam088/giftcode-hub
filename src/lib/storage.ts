import { storage } from '#imports';
import type { LocalePreference } from './i18n/index.svelte';
import type { Job, ResultStatus, RunMode, StatusCounts } from './job';
import type { SiteId } from './sites/types';

export interface Settings {
  /** Game and server the side panel works on. */
  activeSite: SiteId;
  locale: LocalePreference;
  mode: RunMode;
  /** Delay between submits in auto mode. Never lower than MIN_DELAY_MS. */
  delayMs: number;
  /** Skip codes that already got a final result on the same account and site. */
  skipKnown: boolean;
  /** Mask codes with a final result once a job is done. Pending and unknown stay readable. */
  maskFinishedCodes: boolean;
  /** Keep running even when the redeem tab is hidden or backgrounded. */
  allowBackground: boolean;
  /** Desktop notification when a job finishes or pauses on its own. */
  notify: boolean;
  /** Folder of the scraper feeds, each site reads `<base><feedKey>.json`. Empty disables it. */
  feedBaseUrl: string;
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
  /** Missing on entries written before sites were split; those were Delta Force Garena. */
  siteId?: SiteId;
  account: string;
  mode: RunMode;
  startedAt: number;
  finishedAt: number;
  total: number;
  counts: StatusCounts;
}

/** `<siteId>:<account>`, then SHA 256 of the code, then the final result. */
export type KnownCodes = Record<string, Record<string, ResultStatus>>;
export type PerSite<T> = Partial<Record<SiteId, T>>;

// Delta Force page debounce is 1 s, and toasts are dismissed on result capture
export const MIN_DELAY_MS = 1500;
export const MAX_HISTORY = 30;
const LEGACY_SITE: SiteId = 'df-garena';

export const DEFAULT_SETTINGS: Settings = {
  activeSite: 'df-garena',
  locale: 'auto',
  mode: 'auto',
  delayMs: 3000,
  skipKnown: true,
  maskFinishedCodes: false,
  allowBackground: true,
  notify: true,
  feedBaseUrl: '',
  autoSyncFeed: true,
};

export function knownKey(siteId: SiteId, account: string): string {
  return `${siteId}:${account}`;
}

/** Splits a known codes key back into site and account. */
export function parseKnownKey(key: string): { siteId: string; account: string } {
  const index = key.indexOf(':');
  return index === -1
    ? { siteId: LEGACY_SITE, account: key }
    : { siteId: key.slice(0, index), account: key.slice(index + 1) };
}

/** Turns the old single feed URL (".../feed/codes.json") into the feed folder. */
export function feedBaseFromUrl(url: string | undefined): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('.json') ? trimmed.slice(0, trimmed.lastIndexOf('/') + 1) : trimmed;
}

export function feedUrlFor(base: string, feedKey: string): string {
  const folder = base.trim();
  if (!folder) return '';
  return `${folder.endsWith('/') ? folder : `${folder}/`}${feedKey}.json`;
}

// Migrations from the single site version (v1). Exported for tests.
type SettingsV1 = Omit<Settings, 'activeSite' | 'locale' | 'feedBaseUrl' | 'allowBackground'> & {
  feedUrl?: string;
  allowBackground?: boolean;
};

export function migrateSettingsV2(old: SettingsV1): Settings {
  const { feedUrl, ...rest } = old ?? {};
  return { ...DEFAULT_SETTINGS, ...rest, feedBaseUrl: feedBaseFromUrl(feedUrl) };
}

export function migrateKnownCodesV2(old: KnownCodes): KnownCodes {
  return Object.fromEntries(
    Object.entries(old ?? {}).map(([key, codes]) => [
      key.includes(':') ? key : knownKey(LEGACY_SITE, key),
      codes,
    ]),
  );
}

export function migrateFeedSyncV2(old: FeedSync | null): PerSite<FeedSync> {
  return old ? { [LEGACY_SITE]: old } : {};
}

// Only the side panel (orchestrator) writes these, other contexts read or watch them
export const jobsItem = storage.defineItem<PerSite<Job>>('local:jobs', { fallback: {} });
/** Pre split storage, read once by the runner to move the job under its site. */
export const legacyJobItem = storage.defineItem<Job | null>('local:job', { fallback: null });

export const knownCodesItem = storage.defineItem<KnownCodes>('local:knownCodes', {
  fallback: {},
  version: 2,
  migrations: { 2: migrateKnownCodesV2 },
});

export const historyItem = storage.defineItem<HistoryEntry[]>('local:history', { fallback: [] });

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 2,
  migrations: { 2: migrateSettingsV2 },
});

/** Unsent text in the code box per site, so closing the side panel does not lose it. */
export const draftsItem = storage.defineItem<PerSite<string>>('local:drafts', { fallback: {} });
export const legacyDraftItem = storage.defineItem<string>('local:draft', { fallback: '' });

/** Codes sent from the page context menu, merged into the active site's draft. */
export const inboxItem = storage.defineItem<string[]>('local:inbox', { fallback: [] });

export const feedSyncItem = storage.defineItem<PerSite<FeedSync>>('local:feedSync', {
  fallback: {},
  version: 2,
  migrations: { 2: migrateFeedSyncV2 },
});

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
    throw new Error('msg.backupInvalid');
  }
  if (!data.knownCodes || typeof data.knownCodes !== 'object' || !Array.isArray(data.history)) {
    throw new Error('msg.backupMissing');
  }
  const settings = data.settings as Partial<Settings & SettingsV1> | undefined;
  return {
    app: 'gift-code-redeemer',
    version: 1,
    exportedAt: Number(data.exportedAt) || Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      feedBaseUrl: settings?.feedBaseUrl ?? feedBaseFromUrl(settings?.feedUrl),
      delayMs: clampDelay(Number(settings?.delayMs) || DEFAULT_SETTINGS.delayMs),
      allowBackground: settings?.allowBackground ?? DEFAULT_SETTINGS.allowBackground,
    },
    // Older backups have keys without a site prefix
    knownCodes: migrateKnownCodesV2(data.knownCodes),
    history: data.history.slice(0, MAX_HISTORY),
  };
}

export function clampDelay(ms: number): number {
  return Math.max(MIN_DELAY_MS, ms);
}
