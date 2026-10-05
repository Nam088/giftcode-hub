import type { ResultStatus } from '../job';

export type SiteId = 'df-garena' | 'df-global';
export type GameId = 'deltaforce';

export interface ResultRule {
  /** Matched against the result text shown by the site. */
  pattern: RegExp;
  status: ResultStatus | 'captcha' | 'rate_limited';
}

/**
 * One redeem page = one adapter. Games with several servers (Delta Force Garena and
 * Global) get one adapter per server, so codes, history and feeds never mix.
 */
export interface SiteAdapter {
  id: SiteId;
  game: GameId;
  /** Content script match patterns; also used to find the redeem tab. */
  matches: string[];
  /** Page to open for the given UI language. */
  redeemUrl: (lang: string) => string;
  /** File name of this site's feed, without .json. */
  feedKey: string;
  codeFormat: RegExp;
  selectors: {
    input: string;
    submit: string;
    /** Elements whose text the site rewrites to report a result (toast, dialog). */
    resultTargets: string[];
    /** Closes the result dialog so the next code starts from a clean page. */
    dismiss?: string;
    /** Closes any temporary toast or notification to clear the way for the next code. */
    dismissToast?: string;
    /** Visible only when the user is logged in. */
    loggedInMarker: string;
    /** Element holding the account name, used to remember results per account. */
    accountName: string;
    captcha: string;
  };
  resultRules: ResultRule[];
  resultTimeoutMs: number;
}
