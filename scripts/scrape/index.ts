// Daily scraper: reads public code list pages and merges them into one feed per site,
// feed/<feedKey>.json (for example df-garena.json, df-global.json).
// Run with `pnpm scrape`. A GitHub Action runs it once a day and commits changes.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  emptyFeed,
  type Feed,
  mergeFeed,
  type ScrapedCode,
  serializeFeed,
  updateSourceStats,
} from '../../src/lib/feed.ts';
import { extractCodes, robotsAllows } from './extract.ts';
import { FEEDS, type FeedKey, SOURCES } from './sources.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const USER_AGENT = 'giftcode-hub-feed/1.0 (+https://github.com/Nam088/giftcode-hub; once a day)';
const TIMEOUT_MS = 20_000;
const PAUSE_MS = 2000;

const feedPath = (key: FeedKey) => resolve(ROOT, 'feed', `${key}.json`);

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'vi,en;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function loadFeed(key: FeedKey): Promise<Feed> {
  try {
    return JSON.parse(await readFile(feedPath(key), 'utf8')) as Feed;
  } catch {
    return emptyFeed();
  }
}

const scraped: Record<FeedKey, ScrapedCode[]> = Object.fromEntries(
  FEEDS.map((f) => [f, []]),
) as never;
const bySource: Record<FeedKey, Record<string, string[]>> = Object.fromEntries(
  FEEDS.map((f) => [f, {}]),
) as never;
const okSources = new Map<FeedKey, number>();
const report: string[] = [];

for (const source of SOURCES) {
  const url = new URL(source.url);
  try {
    const robots = await get(`${url.origin}/robots.txt`).then((r) => (r.ok ? r.text() : ''));
    if (!robotsAllows(robots, url.pathname)) {
      report.push(`| ${source.feed} | ${source.id} | skipped (robots.txt) | 0 |`);
      continue;
    }
    const response = await get(source.url);
    if (!response.ok) {
      report.push(`| ${source.feed} | ${source.id} | HTTP ${response.status} | 0 |`);
      continue;
    }
    const codes = extractCodes(await response.text(), source);
    for (const { code, expired } of codes) {
      scraped[source.feed].push({ code, source: source.id, expired });
    }
    bySource[source.feed][source.id] = codes.map((c) => c.code);
    okSources.set(source.feed, (okSources.get(source.feed) ?? 0) + 1);
    report.push(`| ${source.feed} | ${source.id} | ok | ${codes.length} |`);
  } catch (error) {
    report.push(`| ${source.feed} | ${source.id} | error: ${(error as Error).message} | 0 |`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

const today = new Date().toISOString().slice(0, 10);
const totals: string[] = [];
let written = 0;

for (const key of FEEDS) {
  // Keep a feed as is when all its sources failed, so one bad day does not look like "no codes"
  if (!okSources.get(key)) {
    totals.push(`| ${key} | unchanged (all sources failed) | | |`);
    continue;
  }
  const previous = await loadFeed(key);
  const merged = mergeFeed(previous, scraped[key], today);
  const feed = {
    ...merged.feed,
    sources: updateSourceStats(previous.sources, bySource[key], today),
  };
  await mkdir(dirname(feedPath(key)), { recursive: true });
  await writeFile(feedPath(key), serializeFeed(feed));
  written++;
  const added = merged.added.length ? merged.added.map((c) => `\`${c}\``).join(', ') : '';
  totals.push(`| ${key} | ${Object.keys(feed.codes).length} | ${merged.added.length} | ${added} |`);
}

const summary = [
  `### Gift code feeds ${today}`,
  '',
  '| Feed | Source | Status | Codes |',
  '| --- | --- | --- | --- |',
  ...report,
  '',
  '| Feed | Total | New | New codes |',
  '| --- | --- | --- | --- |',
  ...totals,
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);

if (written === 0) {
  console.error('All sources failed, feeds left unchanged');
  process.exit(1);
}
