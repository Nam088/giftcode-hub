import type { SiteAdapter } from '../types';
import { DF_COMMON, DF_RESULT_RULES } from './shared';

// Garena SEA server: redeem.df.garena.sg (captured 2026-10-05). Login is required and
// the page shows no captcha on submit. Codes 601008 and 503601 show nothing and end up
// as unknown after the timeout.
export const dfGarena: SiteAdapter = {
  id: 'df-garena',
  game: 'deltaforce',
  matches: ['https://redeem.df.garena.sg/*'],
  redeemUrl: (lang) => `https://redeem.df.garena.sg/${lang === 'vi' ? 'vi' : 'en'}/cdkgarena.html`,
  feedKey: 'df-garena',
  codeFormat: DF_COMMON.codeFormat,
  selectors: {
    input: '.state-after .exc-input',
    submit: '.state-after .btn-exchange',
    resultTargets: DF_COMMON.resultTargets,
    dismiss: DF_COMMON.dismiss,
    dismissToast: DF_COMMON.dismissToast,
    loggedInMarker: '.state.state-after.show',
    accountName: DF_COMMON.accountName,
    captcha: DF_COMMON.captcha,
  },
  resultRules: DF_RESULT_RULES,
  resultTimeoutMs: DF_COMMON.resultTimeoutMs,
};
