import { describe, expect, it } from 'vitest';
import {
  feedBaseFromUrl,
  feedUrlFor,
  migrateFeedSyncV2,
  migrateKnownCodesV2,
  migrateSettingsV2,
  parseKnownKey,
} from '@/lib/storage';

describe('migration from the single site version', () => {
  it('moves settings to Garena and turns the old feed URL into a folder', () => {
    const settings = migrateSettingsV2({
      mode: 'semi',
      delayMs: 3000,
      skipKnown: true,
      maskFinishedCodes: false,
      notify: true,
      autoSyncFeed: true,
      feedUrl: 'https://raw.githubusercontent.com/Nam088/giftcode-hub/main/feed/codes.json',
    });
    expect(settings).toMatchObject({
      activeSite: 'df-garena',
      locale: 'auto',
      mode: 'semi',
      feedBaseUrl: 'https://raw.githubusercontent.com/Nam088/giftcode-hub/main/feed/',
    });
    expect('feedUrl' in settings).toBe(false);
  });

  it('prefixes old known code keys with the Garena site', () => {
    expect(
      migrateKnownCodesV2({ Nam: { abc: 'used' }, 'df-global:Bob': { def: 'success' } }),
    ).toEqual({
      'df-garena:Nam': { abc: 'used' },
      'df-global:Bob': { def: 'success' },
    });
  });

  it('keeps the last feed sync under Garena', () => {
    expect(migrateFeedSyncV2({ at: 1, active: 2, added: 3 })).toEqual({
      'df-garena': { at: 1, active: 2, added: 3 },
    });
    expect(migrateFeedSyncV2(null)).toEqual({});
  });
});

describe('feed URLs and known keys', () => {
  it('builds one feed file per site from the folder', () => {
    expect(feedUrlFor('https://x.test/feed', 'df-global')).toBe(
      'https://x.test/feed/df-global.json',
    );
    expect(feedUrlFor('https://x.test/feed/', 'df-garena')).toBe(
      'https://x.test/feed/df-garena.json',
    );
    expect(feedUrlFor('', 'df-garena')).toBe('');
  });

  it('keeps a folder URL as is', () => {
    expect(feedBaseFromUrl('https://x.test/feed/')).toBe('https://x.test/feed/');
  });

  it('splits site and account, also when the account has a colon', () => {
    expect(parseKnownKey('df-global:a:b')).toEqual({ siteId: 'df-global', account: 'a:b' });
    expect(parseKnownKey('legacy')).toEqual({ siteId: 'df-garena', account: 'legacy' });
  });
});
