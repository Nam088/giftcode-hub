import type { ResultStatus } from '../job';

export interface ResultRule {
  /** Matched against the result text shown by the site. */
  pattern: RegExp;
  status: ResultStatus | 'captcha' | 'rate_limited';
}

export interface SiteAdapter {
  id: string;
  hostname: string;
  codeFormat: RegExp;
  selectors: {
    input: string;
    submit: string;
    /** Elements whose text the site rewrites to report a result (toast, dialog). */
    resultTargets: string[];
    /** Closes the result dialog so the next code starts from a clean page. */
    dismiss?: string;
    /** Matches only when the user is logged in. */
    loggedInMarker: string;
    /** Element holding the account name, used to remember results per account. */
    accountName: string;
    captcha: string;
  };
  resultRules: ResultRule[];
  resultTimeoutMs: number;
}
