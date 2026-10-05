import type { SiteAdapter } from '../types';
import { DF_COMMON, DF_RESULT_RULES } from './shared';

// Global server: playdeltaforce.com/<lang>/cdkredeem.html (read 2026-10-05). Only the
// logged in path is supported. Redeeming by UID without logging in goes through a
// Tencent captcha, which this extension does not touch.
export const dfGlobal: SiteAdapter = {
  id: 'df-global',
  game: 'deltaforce',
  matches: ['https://www.playdeltaforce.com/*/cdkredeem.html*'],
  redeemUrl: (lang) =>
    `https://www.playdeltaforce.com/${lang === 'vi' ? 'vi' : 'en'}/cdkredeem.html`,
  feedKey: 'df-global',
  codeFormat: DF_COMMON.codeFormat,
  selectors: {
    input: '#cdkey',
    submit: '#btn-redeem',
    resultTargets: DF_COMMON.resultTargets,
    dismiss: DF_COMMON.dismiss,
    dismissToast: DF_COMMON.dismissToast,
    // Shown by the page script only after login; the UID form stays hidden then
    loggedInMarker: '#logined',
    accountName: DF_COMMON.accountName,
    captcha: DF_COMMON.captcha,
  },
  resultRules: DF_RESULT_RULES,
  resultTimeoutMs: DF_COMMON.resultTimeoutMs,
};
