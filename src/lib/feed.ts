// Shared by the daily scraper (scripts/scrape) and the extension. Keep this file free of
// imports so Node can run it directly with type stripping.

export interface FeedEntry {
  /** Day the code was first scraped, YYYY-MM-DD. */
  firstSeen: string;
  /** Last day any source still listed it. */
  lastSeen: string;
  /** Source ids that listed it, sorted. */
  sources: string[];
  /** Set when a source marks the code as expired. */
  expired?: true;
}

export interface SourceStat {
  /** Codes the source listed on its last successful scrape. */
  count: number;
  /** Day the source's code list last changed, YYYY-MM-DD. Shows which sources stay fresh. */
  lastChanged: string;
  /** Short hash of the sorted code list, to detect changes without storing it again. */
  hash: string;
}

export interface Feed {
  version: 1;
  /** Changes only when the code list changes, so unchanged runs produce no commit. */
  updatedAt: string;
  codes: Record<string, FeedEntry>;
  /** Per source freshness, updated only when that source's list changes. */
  sources?: Record<string, SourceStat>;
}

export interface ScrapedCode {
  code: string;
  source: string;
  expired?: boolean;
}

export const FEED_MAX_CODES = 5000;
/** Codes no source has listed for this long are dropped from the feed. */
export const FEED_PRUNE_DAYS = 180;

const DAY_MS = 86_400_000;

/**
 * Heuristic for a table cell that holds a gift code: letters and digits only, not a
 * plain number, and shaped like a code (has a digit, is all caps, or has several
 * capitals like "TrickOrTreat"). Drops words like "Available" or row numbers.
 */
export function looksLikeCode(text: string): boolean {
  if (!/^[A-Za-z0-9]{5,32}$/.test(text) || /^\d+$/.test(text)) return false;
  const upper = text.replace(/[^A-Z]/g, '').length;
  if (/\d/.test(text) && /[A-Za-z]/.test(text)) return true;
  if (text.length >= 6 && text === text.toUpperCase()) return true;
  return text.length >= 8 && upper >= 2;
}

export function emptyFeed(): Feed {
  return { version: 1, updatedAt: '', codes: {} };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/**
 * Merges one scrape into the feed. The code string is the key, so the same code from
 * several sources or several days is stored once. Returns the codes that are new.
 */
export function mergeFeed(
  feed: Feed,
  scraped: readonly ScrapedCode[],
  today: string,
  now = new Date().toISOString(),
): { feed: Feed; added: string[] } {
  const codes: Record<string, FeedEntry> = structuredClone(feed.codes);
  const added: string[] = [];

  for (const { code, source, expired } of scraped) {
    const entry = codes[code];
    if (!entry) {
      codes[code] = { firstSeen: today, lastSeen: today, sources: [source] };
      added.push(code);
    } else {
      entry.lastSeen = today;
      if (!entry.sources.includes(source)) entry.sources = [...entry.sources, source].sort();
    }
    const target = codes[code] as FeedEntry;
    if (expired) target.expired = true;
  }

  for (const [code, entry] of Object.entries(codes)) {
    if (daysBetween(entry.lastSeen, today) > FEED_PRUNE_DAYS) delete codes[code];
  }

  // Stable key order keeps git diffs small
  const sorted = Object.fromEntries(
    Object.entries(codes).sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
  );
  const changed = JSON.stringify(sorted) !== JSON.stringify(feed.codes);
  return {
    feed: { version: 1, updatedAt: changed ? now : feed.updatedAt, codes: sorted },
    added,
  };
}

/** FNV 1a over the sorted list; enough to notice a change, not meant to be secure. */
export function listHash(codes: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...codes].sort().join('\n')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Records when each source's list last changed. Unchanged sources keep their old entry. */
export function updateSourceStats(
  previous: Record<string, SourceStat> | undefined,
  scrapedBySource: Record<string, readonly string[]>,
  today: string,
): Record<string, SourceStat> {
  const stats: Record<string, SourceStat> = { ...previous };
  for (const [source, codes] of Object.entries(scrapedBySource)) {
    const hash = listHash(codes);
    if (stats[source]?.hash === hash) continue;
    stats[source] = { count: codes.length, lastChanged: today, hash };
  }
  return Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)));
}

export function serializeFeed(feed: Feed): string {
  return `${JSON.stringify(feed, null, 2)}\n`;
}

/** Validates a downloaded feed. Untrusted input: wrong shape throws, bad codes are dropped. */
export function parseFeed(text: string, format: RegExp): Feed {
  const data = JSON.parse(text) as Partial<Feed>;
  if (data.version !== 1 || !data.codes || typeof data.codes !== 'object') {
    throw new Error('msg.feedInvalid');
  }
  const entries = Object.entries(data.codes);
  if (entries.length > FEED_MAX_CODES) throw new Error('msg.feedTooLarge');
  const codes: Record<string, FeedEntry> = {};
  for (const [code, entry] of entries) {
    if (!format.test(code) || typeof entry?.lastSeen !== 'string') continue;
    codes[code] = {
      firstSeen: String(entry.firstSeen ?? entry.lastSeen),
      lastSeen: entry.lastSeen,
      sources: Array.isArray(entry.sources) ? entry.sources.map(String) : [],
      ...(entry.expired ? { expired: true as const } : {}),
    };
  }
  return { version: 1, updatedAt: String(data.updatedAt ?? ''), codes };
}

/** Codes worth trying: not marked expired and still listed within the last maxAgeDays. */
export function activeCodes(feed: Feed, maxAgeDays: number, today = new Date()): string[] {
  const todayStr = today.toISOString().slice(0, 10);
  return Object.entries(feed.codes)
    .filter(([, e]) => !e.expired && daysBetween(e.lastSeen, todayStr) <= maxAgeDays)
    .sort(([, a], [, b]) => b.firstSeen.localeCompare(a.firstSeen))
    .map(([code]) => code);
}
