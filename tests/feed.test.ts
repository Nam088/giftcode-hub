import { describe, expect, it } from 'vitest';
import {
  activeCodes,
  emptyFeed,
  looksLikeCode,
  mergeFeed,
  parseFeed,
  updateSourceStats,
} from '@/lib/feed';
import { extractCodes, extractFromTables, robotsAllows } from '../scripts/scrape/extract';

const FORMAT = /^[A-Za-z0-9-]{4,64}$/;

describe('looksLikeCode', () => {
  it.each(['DFharbor738', 'WELCOMETODF', 'TrickOrTreat', 'PWC260419S65', 'AUGTUTO'])(
    'accepts %s',
    (code) => expect(looksLikeCode(code)).toBe(true),
  );
  it.each(['12', 'Available', 'Mới nhất', 'Quà', 'code', 'DF'])('rejects %s', (text) =>
    expect(looksLikeCode(text)).toBe(false),
  );
});

describe('extractFromTables', () => {
  it('reads code cells and flags rows that say expired', () => {
    const html = `<table>
      <tr><th>Mã code</th><th>Trạng thái</th></tr>
      <tr><td>1</td><td>DFharbor738</td><td>Mới nhất</td></tr>
      <tr><td>2</td><td> TrickOrTreat </td><td>Đã hết hạn</td></tr>
      <tr><td>3</td><td><p><strong>WELCOMETODF </strong></p></td><td>Code mới</td></tr>
    </table>`;
    expect(extractFromTables(html)).toEqual([
      { code: 'DFharbor738', expired: false },
      { code: 'TrickOrTreat', expired: true },
      { code: 'WELCOMETODF', expired: false },
    ]);
  });
});

describe('robotsAllows', () => {
  const robots =
    'User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: bad\nDisallow: /';
  it('applies the longest matching rule for *', () => {
    expect(robotsAllows(robots, '/tin-tuc/code')).toBe(true);
    expect(robotsAllows(robots, '/admin/x')).toBe(false);
    expect(robotsAllows(robots, '/admin/public/x')).toBe(true);
  });
});

describe('mergeFeed', () => {
  it('stores a code once even when several sources list it', () => {
    const { feed, added } = mergeFeed(
      emptyFeed(),
      [
        { code: 'AAA111', source: 'b' },
        { code: 'AAA111', source: 'a' },
      ],
      '2026-10-05',
      'T1',
    );
    expect(added).toEqual(['AAA111']);
    expect(feed.codes.AAA111?.sources).toEqual(['a', 'b']);
  });

  it('keeps firstSeen and updates lastSeen on later days', () => {
    const day1 = mergeFeed(emptyFeed(), [{ code: 'AAA111', source: 'a' }], '2026-10-05', 'T1');
    const day2 = mergeFeed(day1.feed, [{ code: 'AAA111', source: 'a' }], '2026-10-06', 'T2');
    expect(day2.added).toEqual([]);
    expect(day2.feed.codes.AAA111).toMatchObject({
      firstSeen: '2026-10-05',
      lastSeen: '2026-10-06',
    });
  });

  it('does not touch updatedAt when nothing changed, so no commit happens', () => {
    const day1 = mergeFeed(emptyFeed(), [{ code: 'AAA111', source: 'a' }], '2026-10-05', 'T1');
    const again = mergeFeed(day1.feed, [{ code: 'AAA111', source: 'a' }], '2026-10-05', 'T2');
    expect(again.feed.updatedAt).toBe('T1');
  });

  it('prunes codes no source has listed for a long time', () => {
    const old = mergeFeed(emptyFeed(), [{ code: 'OLD111', source: 'a' }], '2026-01-01', 'T1');
    const later = mergeFeed(old.feed, [{ code: 'NEW111', source: 'a' }], '2026-10-05', 'T2');
    expect(Object.keys(later.feed.codes)).toEqual(['NEW111']);
  });
});

describe('parseFeed and activeCodes', () => {
  it('drops malformed codes and returns recent, non expired codes newest first', () => {
    const feed = parseFeed(
      JSON.stringify({
        version: 1,
        updatedAt: 'T',
        codes: {
          OLDER1: { firstSeen: '2026-09-01', lastSeen: '2026-10-05', sources: ['a'] },
          NEWER1: { firstSeen: '2026-10-04', lastSeen: '2026-10-05', sources: ['a'] },
          GONE01: {
            firstSeen: '2026-10-04',
            lastSeen: '2026-10-05',
            sources: ['a'],
            expired: true,
          },
          STALE1: { firstSeen: '2026-01-01', lastSeen: '2026-02-01', sources: ['a'] },
          'bad code!': { firstSeen: '2026-10-04', lastSeen: '2026-10-05', sources: ['a'] },
        },
      }),
      FORMAT,
    );
    expect(Object.keys(feed.codes)).not.toContain('bad code!');
    expect(activeCodes(feed, 60, new Date('2026-10-05'))).toEqual(['NEWER1', 'OLDER1']);
  });

  it('rejects files that are not a feed', () => {
    expect(() => parseFeed('{"foo":1}', FORMAT)).toThrow();
  });
});

describe('updateSourceStats', () => {
  it('moves lastChanged only when a source list changes', () => {
    const day1 = updateSourceStats(undefined, { a: ['X1', 'Y1'], b: ['Z1'] }, '2026-10-05');
    const day2 = updateSourceStats(day1, { a: ['Y1', 'X1'], b: ['Z1', 'W1'] }, '2026-10-06');
    expect(day2.a?.lastChanged).toBe('2026-10-05');
    expect(day2.b).toMatchObject({ lastChanged: '2026-10-06', count: 2 });
  });

  it('keeps a source that failed today untouched', () => {
    const day1 = updateSourceStats(undefined, { a: ['X1'] }, '2026-10-05');
    expect(updateSourceStats(day1, {}, '2026-10-06').a?.lastChanged).toBe('2026-10-05');
  });
});

describe('extractCodes', () => {
  const html = `<nav><ul><li>Download</li></ul></nav>
    <ul>
      <li><strong>DFWizard309</strong>: weapon skin</li>
      <li>DELTAFORCE2026 – M4A1 camo</li>
      <li>Share on WhatsApp</li>
      <li>WhatsApp</li>
      <li>TOPUPlive</li>
    </ul>
    <table><tr><td>TrickOrTreat</td><td>expired</td></tr></table>`;

  it('reads tables only unless lists are enabled', () => {
    expect(extractCodes(html).map((c) => c.code)).toEqual(['TrickOrTreat']);
  });

  it('reads leading codes from list items and skips brands and ignored words', () => {
    const codes = extractCodes(html, { lists: true, ignore: ['TOPUPlive'] });
    expect(codes.map((c) => c.code).sort()).toEqual([
      'DELTAFORCE2026',
      'DFWizard309',
      'TrickOrTreat',
    ]);
    expect(codes.find((c) => c.code === 'TrickOrTreat')?.expired).toBe(true);
  });
});
