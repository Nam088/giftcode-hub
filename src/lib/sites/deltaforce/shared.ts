import type { ResultRule } from '../types';
import { DF_MESSAGES } from './messages';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anyOf = (texts: string[], extra: string[] = []) =>
  new RegExp([...texts.map(escapeRegExp), ...extra].join('|'), 'i');

/**
 * Both Delta Force redeem pages share comm.js: success rewrites `#diaTips p`, errors
 * go to the `#superTips` toast (ignored for ~2.2 s while one shows), and locales without
 * a translation show the raw key such as "error_hint_400072", so keys are matched too.
 */
export const DF_RESULT_RULES: ResultRule[] = [
  { pattern: anyOf(DF_MESSAGES.success), status: 'success' },
  { pattern: anyOf(DF_MESSAGES.invalid), status: 'invalid' },
  {
    pattern: anyOf(DF_MESSAGES.used, [
      'error_hint_40006[78]',
      'error_hint_400072',
      'error_hint_51104',
    ]),
    status: 'used',
  },
  { pattern: anyOf(DF_MESSAGES.expired, ['error_hint_400070']), status: 'expired' },
];

export const DF_COMMON = {
  // The pages strip whitespace themselves; the format is not documented, so stay loose
  codeFormat: /^[A-Za-z0-9-]{4,64}$/,
  resultTargets: ['#superTips', '#diaTips p'],
  dismiss: '#diaTips .btn-close',
  dismissToast: '#superTips',
  accountName: '#logined .username',
  captcha: 'iframe[src*="captcha"]',
  resultTimeoutMs: 10_000,
};
