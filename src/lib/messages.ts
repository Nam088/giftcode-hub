import type { ResultStatus } from './job';

export interface ProbeResult {
  hasForm: boolean;
  loggedIn: boolean;
  /** Account name shown by the site, empty when unknown. */
  account: string;
  captcha: boolean;
  visible: boolean;
}

export type RedeemOutcome =
  // Nothing was submitted, safe to put the code back in the queue
  | { phase: 'before_submit'; error: string }
  | {
      phase: 'after_submit';
      status: ResultStatus | 'unknown' | 'captcha' | 'rate_limited';
      message: string;
    };

export type ContentRequest =
  | { type: 'probe' }
  // Auto mode: fill, click, read the result
  | { type: 'redeem'; code: string }
  // Semi auto mode: fill, wait for the user to click, read the result
  | { type: 'arm'; code: string; timeoutMs: number }
  | { type: 'disarm' };

export type ContentResponse<T extends ContentRequest['type']> = T extends 'probe'
  ? ProbeResult
  : T extends 'disarm'
    ? { ok: true }
    : RedeemOutcome;

/** Sends a typed request to the content script. Throws when the tab has no listener. */
export function sendToTab<T extends ContentRequest>(
  tabId: number,
  request: T,
): Promise<ContentResponse<T['type']>> {
  return browser.tabs.sendMessage(tabId, request);
}

/** Chrome's error when the message never reached a content script, so nothing was submitted. */
export function isNotDelivered(error: unknown): boolean {
  return String(error).includes('Receiving end does not exist');
}
