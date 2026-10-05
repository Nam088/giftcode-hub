import { dfGarena } from './deltaforce/garena';
import { dfGlobal } from './deltaforce/global';
import type { SiteAdapter, SiteId } from './types';

export type { GameId, SiteAdapter, SiteId } from './types';

/** Every supported redeem page. Add a new game or server by adding an adapter here. */
export const SITES: readonly SiteAdapter[] = [dfGarena, dfGlobal];
export const DEFAULT_SITE: SiteId = 'df-garena';

export function getSite(id: SiteId | undefined): SiteAdapter {
  return SITES.find((site) => site.id === id) ?? dfGarena;
}

export function isSiteId(value: unknown): value is SiteId {
  return SITES.some((site) => site.id === value);
}

/** Converts a match pattern like https://host/*\/page.html* into a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function findSiteForUrl(url: string): SiteAdapter | undefined {
  return SITES.find((site) => site.matches.some((p) => patternToRegExp(p).test(url)));
}
