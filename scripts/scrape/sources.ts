// Public pages that list gift codes, grouped by the feed (site) they belong to.
// Checked on 2026-10-05: robots.txt allows these paths and they render without JS.
// Pages that answer 403 to a plain request (pockettactics.com, gamsgo.com, pcgamesn.com)
// are left out on purpose: a 403 is the site saying no, and we do not work around it.
// From GitHub runners fpt.vn and fptshop.com.vn may refuse too; that is reported, not evaded.
export type FeedKey = 'df-garena' | 'df-global';

export interface Source {
  id: string;
  feed: FeedKey;
  url: string;
  /** Code shaped words the page uses that are not codes (brand names). */
  ignore?: string[];
  /** The page lists codes in bullets or bold text instead of tables. */
  lists?: boolean;
}

export const SOURCES: readonly Source[] = [
  // Delta Force, Garena SEA server (redeem.df.garena.sg), Vietnamese sites
  {
    id: 'maytinhdaiviet',
    feed: 'df-garena',
    url: 'https://maytinhdaiviet.com/tong-hop-giftcode-delta-force-moi-nhat-2026-cap-nhat-lien-tuc/',
  },
  {
    id: 'fpt',
    feed: 'df-garena',
    url: 'https://fpt.vn/tin-tuc/code-delta-force-garena-moi-nhat-15350.html',
  },
  {
    id: 'fptshop',
    feed: 'df-garena',
    url: 'https://fptshop.com.vn/tin-tuc/giai-tri/code-delta-force-184570',
  },
  { id: 'shopee-blog', feed: 'df-garena', url: 'https://shopee.vn/blog/code-delta-force/' },
  {
    id: 'download-com-vn',
    feed: 'df-garena',
    url: 'https://download.com.vn/code-game-delta-force-195638',
  },
  {
    id: 'sforum',
    feed: 'df-garena',
    url: 'https://cellphones.com.vn/sforum/code-delta-force-garena',
  },

  // Delta Force, Global server (playdeltaforce.com/<lang>/cdkredeem.html)
  {
    id: 'timesaver',
    feed: 'df-global',
    url: 'https://timesaver.gg/blog/delta-force-codes',
    lists: true,
  },
  {
    id: 'buffbuff',
    feed: 'df-global',
    url: 'https://buffbuff.com/blog/delta-force-exclusive-codes',
    lists: true,
  },
  {
    id: 'topuplive',
    feed: 'df-global',
    url: 'https://www.topuplive.com/news/delta-force-redeem-code.html',
    ignore: ['TOPUPlive'],
    lists: true,
  },
  {
    id: 'nerdschalk',
    feed: 'df-global',
    url: 'https://nerdschalk.com/delta-force-codes/',
    lists: true,
  },
  {
    id: 'ldshop',
    feed: 'df-global',
    url: 'https://www.ldshop.gg/blog/news/delta-force-redeem-code.html',
    lists: true,
  },
];

export const FEEDS: readonly FeedKey[] = [...new Set(SOURCES.map((s) => s.feed))];
