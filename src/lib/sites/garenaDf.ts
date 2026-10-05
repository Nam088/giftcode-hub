import type { SiteAdapter } from './types';

// Based on the live page captured on 2026-10-05 (cdkgarena.html, jQuery + comm.js):
// * success calls setDiaTips(lang5), which rewrites `#diaTips p` and opens a dialog
// * errors call setSuperTips(msg), which rewrites `#superTips` for 2 s and ignores new
//   toasts while one is showing, so submits must be spaced more than 2 s apart
// * the vi locale has no error_hint_* strings, so the toast shows the raw key
//   (for example "error_hint_400072"), which is why rules match keys as well as text
// * codes 601008 and 503601 show nothing and end up as unknown after the timeout
export const garenaDf: SiteAdapter = {
  id: 'garena-df',
  hostname: 'redeem.df.garena.sg',
  // The page strips whitespace itself, format is not documented so keep this loose
  codeFormat: /^[A-Za-z0-9-]{4,64}$/,
  selectors: {
    input: '.state-after .exc-input',
    submit: '.state-after .btn-exchange',
    resultTargets: ['#superTips', '#diaTips p'],
    dismiss: '#diaTips .btn-close',
    loggedInMarker: '.state.state-after.show',
    accountName: '#logined .username',
    captcha: 'iframe[src*="captcha"]',
  },
  resultRules: [
    { pattern: /Đã nhận thành công|Successfully claimed/i, status: 'success' },
    { pattern: /CDKey đã nhập không hợp lệ|CDKey entered is not valid/i, status: 'invalid' },
    {
      pattern:
        /không thể đổi thêm CDKey|redemption limit|already redeemed|error_hint_40006[78]|error_hint_400072/i,
      status: 'used',
    },
    { pattern: /redemption period ended|error_hint_400070/i, status: 'expired' },
  ],
  resultTimeoutMs: 10000,
};

export const SITES: readonly SiteAdapter[] = [garenaDf];

export function findSite(hostname: string): SiteAdapter | undefined {
  return SITES.find((site) => site.hostname === hostname);
}
