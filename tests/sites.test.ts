import { describe, expect, it } from 'vitest';
import { findSiteForUrl, getSite, isSiteId, SITES } from '@/lib/sites';

describe('site registry', () => {
  it('keeps site ids and feed keys unique', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    expect(new Set(SITES.map((s) => s.feedKey)).size).toBe(SITES.length);
  });

  it.each([
    ['https://redeem.df.garena.sg/vi/cdkgarena.html', 'df-garena'],
    ['https://redeem.df.garena.sg/en/cdkgarena.html?operate_type=thirdcallback', 'df-garena'],
    ['https://www.playdeltaforce.com/en/cdkredeem.html', 'df-global'],
    ['https://www.playdeltaforce.com/vi/cdkredeem.html#top', 'df-global'],
  ])('maps %s to %s', (url, id) => {
    expect(findSiteForUrl(url)?.id).toBe(id);
  });

  it('ignores other pages on the same domain', () => {
    expect(findSiteForUrl('https://www.playdeltaforce.com/en/news.html')).toBeUndefined();
    expect(findSiteForUrl('https://example.com/')).toBeUndefined();
  });

  it('opens the redeem page in the UI language', () => {
    expect(getSite('df-global').redeemUrl('vi')).toBe(
      'https://www.playdeltaforce.com/vi/cdkredeem.html',
    );
    expect(getSite('df-garena').redeemUrl('en')).toBe(
      'https://redeem.df.garena.sg/en/cdkgarena.html',
    );
  });

  it('falls back to Garena for unknown ids', () => {
    expect(isSiteId('df-garena')).toBe(true);
    expect(isSiteId('nope')).toBe(false);
  });
});
