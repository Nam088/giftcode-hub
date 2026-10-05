import type { SiteAdapter } from './types';

/** Maps the text shown by the site to a status. Anything unmatched is unknown and pauses the job. */
export function classify(site: SiteAdapter, message: string) {
  return site.resultRules.find((rule) => rule.pattern.test(message))?.status ?? 'unknown';
}
