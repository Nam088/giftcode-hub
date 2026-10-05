import type { ContentRequest, ProbeResult, RedeemOutcome } from '@/lib/messages';
import { findSiteForUrl, SITES } from '@/lib/sites';
import { classify } from '@/lib/sites/classify';
import type { SiteAdapter } from '@/lib/sites/types';

/** Cancels the pending semi auto wait, if any. */
let disarm: (() => void) | null = null;

export default defineContentScript({
  matches: SITES.flatMap((site) => site.matches),
  main(ctx) {
    const site = findSiteForUrl(location.href);
    if (!site) return;

    const onMessage = (
      request: ContentRequest,
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
      handle(site, request).then(sendResponse, (error: unknown) =>
        sendResponse({ phase: 'before_submit', error: String(error) } satisfies RedeemOutcome),
      );
      // Keep the channel open for the async response
      return true;
    };

    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      disarm?.();
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});

async function handle(site: SiteAdapter, request: ContentRequest) {
  switch (request.type) {
    case 'probe':
      return probe(site);
    case 'redeem':
      return redeem(site, request.code);
    case 'arm':
      return arm(site, request.code, request.timeoutMs);
    case 'disarm':
      disarm?.();
      return { ok: true };
  }
}

/** Pages hide logged out or logged in blocks with display:none, so presence is not enough. */
function isVisible(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function probe(site: SiteAdapter): ProbeResult {
  const account = document.querySelector(site.selectors.accountName)?.textContent?.trim() ?? '';
  return {
    hasForm: !!document.querySelector(site.selectors.input),
    loggedIn: isVisible(site.selectors.loggedInMarker),
    account,
    captcha: !!document.querySelector(site.selectors.captcha),
    visible: document.visibilityState === 'visible',
  };
}

function fill(site: SiteAdapter, code: string): string | null {
  const input = document.querySelector<HTMLInputElement>(site.selectors.input);
  if (!input) return 'input_missing';
  input.focus();
  input.value = code;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return null;
}

function precheck(site: SiteAdapter, code: string): { button: HTMLElement } | { error: string } {
  if (document.querySelector(site.selectors.captcha)) return { error: 'captcha' };
  if (!isVisible(site.selectors.loggedInMarker)) return { error: 'login_required' };
  const button = document.querySelector<HTMLElement>(site.selectors.submit);
  if (!button) return { error: 'submit_missing' };
  const fillError = fill(site, code);
  if (fillError) return { error: fillError };
  return { button };
}

async function redeem(site: SiteAdapter, code: string): Promise<RedeemOutcome> {
  const ready = precheck(site, code);
  if ('error' in ready) return { phase: 'before_submit', error: ready.error };

  const resultPromise = waitForResult(site);
  ready.button.click();
  return finish(site, await resultPromise);
}

/** Fills the code and waits for the user to press the site's own button. */
async function arm(site: SiteAdapter, code: string, timeoutMs: number): Promise<RedeemOutcome> {
  disarm?.();
  const ready = precheck(site, code);
  if ('error' in ready) return { phase: 'before_submit', error: ready.error };

  let resultPromise: Promise<string | null> | null = null;
  const clicked = await new Promise<boolean>((resolve) => {
    const onClick = () => {
      // Start observing before the site's own handler (bubble phase) runs
      resultPromise = waitForResult(site);
      done(true);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    const done = (value: boolean) => {
      clearTimeout(timer);
      ready.button.removeEventListener('click', onClick, true);
      disarm = null;
      resolve(value);
    };
    ready.button.addEventListener('click', onClick, true);
    disarm = () => done(false);
  });
  if (!clicked || !resultPromise) return { phase: 'before_submit', error: 'cancelled' };
  return finish(site, await resultPromise);
}

function finish(site: SiteAdapter, message: string | null): RedeemOutcome {
  if (message === null) return { phase: 'after_submit', status: 'unknown', message: '' };
  const status = classify(site, message);
  if (status === 'success' && site.selectors.dismiss) {
    document.querySelector<HTMLElement>(site.selectors.dismiss)?.click();
  }
  if (site.selectors.dismissToast) {
    document.querySelector<HTMLElement>(site.selectors.dismissToast)?.click();
  }
  return { phase: 'after_submit', status, message };
}

/**
 * Resolves with the first text the site writes into a result target after submit,
 * or null on timeout. Only mutations count, so stale text from earlier codes is ignored.
 */
function waitForResult(site: SiteAdapter): Promise<string | null> {
  return new Promise((resolve) => {
    const targets = site.selectors.resultTargets
      .map((selector) => document.querySelector(selector))
      .filter((el): el is Element => el !== null);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = targets.find((el) => el === record.target || el.contains(record.target));
        const text = target?.textContent?.trim();
        if (text) return done(text);
      }
    });
    const timer = setTimeout(() => done(null), site.resultTimeoutMs);
    const done = (value: string | null) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    for (const el of targets) {
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
  });
}
