// Public Vietnamese pages that list Garena Delta Force gift codes in HTML tables.
// Checked on 2026-10-05: robots.txt allows these paths and they render without JS.
// Pages that answered 403 to a plain request (pockettactics.com, gamsgo.com) are left
// out on purpose: a 403 is the site saying no, and we do not work around it.
// Global (non Garena) lists such as timesaver.gg are also left out: those codes are
// redeemed on playdeltaforce.com and mostly fail on redeem.df.garena.sg.
export interface Source {
  id: string;
  url: string;
}

export const SOURCES: readonly Source[] = [
  {
    id: 'maytinhdaiviet',
    url: 'https://maytinhdaiviet.com/tong-hop-giftcode-delta-force-moi-nhat-2026-cap-nhat-lien-tuc/',
  },
  { id: 'fpt', url: 'https://fpt.vn/tin-tuc/code-delta-force-garena-moi-nhat-15350.html' },
  { id: 'fptshop', url: 'https://fptshop.com.vn/tin-tuc/giai-tri/code-delta-force-184570' },
  { id: 'shopee-blog', url: 'https://shopee.vn/blog/code-delta-force/' },
  { id: 'download-com-vn', url: 'https://download.com.vn/code-game-delta-force-195638' },
  { id: 'sforum', url: 'https://cellphones.com.vn/sforum/code-delta-force-garena' },
];
