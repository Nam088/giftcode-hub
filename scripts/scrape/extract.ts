import * as cheerio from 'cheerio';
import { looksLikeCode } from '../../src/lib/feed.ts';

export interface ExtractedCode {
  code: string;
  expired: boolean;
}

const EXPIRED = /hết hạn|đã hết|expired|không còn/i;

/** Brand and app names that look like codes in share buttons and lists. */
const STOPWORDS = new Set(
  [
    'WhatsApp',
    'Facebook',
    'YouTube',
    'TikTok',
    'Telegram',
    'Discord',
    'Twitter',
    'Instagram',
    'Messenger',
    'LinkedIn',
    'Pinterest',
    'Reddit',
    'Showroom8h',
  ].map((w) => w.toLowerCase()),
);

export interface ExtractOptions {
  /** Also read list items and bold text; off for sources that keep codes in tables. */
  lists?: boolean;
  ignore?: readonly string[];
}

/**
 * Pulls codes out of a page: every table cell that holds a code, plus list items and
 * bold or code elements that start with one ("DFWizard309: rewards"), which is how
 * English sites usually list them. A row or item mentioning expiry marks it expired.
 */
export function extractCodes(html: string, options: ExtractOptions = {}): ExtractedCode[] {
  const $ = cheerio.load(html);
  const found = new Map<string, ExtractedCode>();
  const skip = new Set(options.ignore ?? []);
  const add = (code: string, context: string) => {
    if (!looksLikeCode(code) || skip.has(code) || STOPWORDS.has(code.toLowerCase())) return;
    const expired = EXPIRED.test(context);
    found.set(code, { code, expired: (found.get(code)?.expired ?? false) || expired });
  };

  $('table tr').each((_, row) => {
    const rowText = $(row).text();
    $(row)
      .find('td')
      .each((_, cell) => add(clean($(cell).text()), rowText));
  });
  if (!options.lists) return [...found.values()];
  $('li, p > strong, p > b, li > strong, li > b, code').each((_, el) => {
    if ($(el).closest('nav, header, footer, table').length) return;
    const text = clean($(el).text());
    const lead = text.match(/^([A-Za-z0-9]{5,32})(?:\s*[:\u2013\u2014-]|$)/);
    if (lead?.[1]) add(lead[1], text);
  });
  return [...found.values()];
}

/** Table only extraction, kept for callers that want just the tables. */
export function extractFromTables(html: string): ExtractedCode[] {
  const $ = cheerio.load(html);
  const found = new Map<string, ExtractedCode>();
  $('table tr').each((_, row) => {
    const rowText = $(row).text();
    $(row)
      .find('td')
      .each((_, cell) => {
        const text = clean($(cell).text());
        if (!looksLikeCode(text)) return;
        const expired = EXPIRED.test(rowText);
        found.set(text, { code: text, expired: (found.get(text)?.expired ?? false) || expired });
      });
  });
  return [...found.values()];
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
