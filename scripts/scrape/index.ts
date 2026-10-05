// Daily scraper: reads public code list pages, merges into feed/codes.json.
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
import { extractFromTables, robotsAllows } from './extract.ts';
import { SOURCES } from './sources.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const FEED_PATH = resolve(ROOT, 'feed/codes.json');
const USER_AGENT = 'giftcode-hub-feed/1.0 (+https://github.com/Nam088/giftcode-hub; once a day)';
const TIMEOUT_MS = 20_000;
const PAUSE_MS = 2000;

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-language': 'vi,en;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function loadFeed(): Promise<Feed> {
  try {
    return JSON.parse(await readFile(FEED_PATH, 'utf8')) as Feed;
  } catch {
    return emptyFeed();
  }
}

const scraped: ScrapedCode[] = [];
const bySource: Record<string, string[]> = {};
const report: string[] = [];
let okSources = 0;

for (const source of SOURCES) {
  const url = new URL(source.url);
  try {
    const robots = await get(`${url.origin}/robots.txt`).then((r) => (r.ok ? r.text() : ''));
    if (!robotsAllows(robots, url.pathname)) {
      report.push(`| ${source.id} | skipped (robots.txt) | 0 |`);
      continue;
    }
    const response = await get(source.url);
    if (!response.ok) {
      report.push(`| ${source.id} | HTTP ${response.status} | 0 |`);
      continue;
    }
    const codes = extractFromTables(await response.text());
    for (const { code, expired } of codes) scraped.push({ code, source: source.id, expired });
    bySource[source.id] = codes.map((c) => c.code);
    report.push(`| ${source.id} | ok | ${codes.length} |`);
    okSources++;
  } catch (error) {
    report.push(`| ${source.id} | error: ${(error as Error).message} | 0 |`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

const today = new Date().toISOString().slice(0, 10);
const previous = await loadFeed();
const merged = mergeFeed(previous, scraped, today);
const added = merged.added;
const feed = { ...merged.feed, sources: updateSourceStats(previous.sources, bySource, today) };
const freshness = Object.entries(feed.sources)
  .sort(([, a], [, b]) => b.lastChanged.localeCompare(a.lastChanged))
  .map(([id, s]) => `| ${id} | ${s.lastChanged} | ${s.count} |`);

const summary = [
  `### Gift code feed ${today}`,
  '',
  '| Source | Status | Codes |',
  '| --- | --- | --- |',
  ...report,
  '',
  `Total in feed: **${Object.keys(feed.codes).length}**, new today: **${added.length}**`,
  '',
  '| Source | List last changed | Codes |',
  '| --- | --- | --- |',
  ...freshness,
  added.length ? `\nNew: ${added.map((c) => `\`${c}\``).join(', ')}` : '',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);

// Keep the old feed when every source failed, so one bad day does not look like "no codes"
if (okSources === 0) {
  console.error('All sources failed, feed left unchanged');
  process.exit(1);
}

await mkdir(dirname(FEED_PATH), { recursive: true });
await writeFile(FEED_PATH, serializeFeed(feed));
