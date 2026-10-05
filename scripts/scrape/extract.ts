import * as cheerio from 'cheerio';
import { looksLikeCode } from '../../src/lib/feed.ts';

export interface ExtractedCode {
  code: string;
  expired: boolean;
}

const EXPIRED = /hết hạn|đã hết|expired|không còn/i;

/** Pulls code shaped cells out of every HTML table; a row mentioning expiry marks it expired. */
export function extractFromTables(html: string): ExtractedCode[] {
  const $ = cheerio.load(html);
  const found = new Map<string, ExtractedCode>();
  $('table tr').each((_, row) => {
    const rowText = $(row).text();
    $(row)
      .find('td')
      .each((_, cell) => {
        const text = $(cell).text().replace(/\s+/g, ' ').trim();
        if (!looksLikeCode(text)) return;
        const expired = EXPIRED.test(rowText);
        const previous = found.get(text);
        found.set(text, { code: text, expired: (previous?.expired ?? false) || expired });
      });
  });
  return [...found.values()];
}

/** Minimal robots.txt check for "User-agent: *" with longest match wins. */
export function robotsAllows(robots: string, path: string): boolean {
  let active = false;
  let best: { allow: boolean; length: number } | null = null;
  for (const line of robots.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') active = value === '*';
    if (!active || !value || (key !== 'allow' && key !== 'disallow')) continue;
    const pattern = new RegExp(
      `^${value
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\\\$$/, '$')}`,
    );
    if (pattern.test(path) && (!best || value.length > best.length)) {
      best = { allow: key === 'allow', length: value.length };
    }
  }
  return best?.allow ?? true;
}
