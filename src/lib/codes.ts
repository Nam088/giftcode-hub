export const MAX_CODES_PER_BATCH = Number.POSITIVE_INFINITY;

export interface ParsedCodes {
  valid: string[];
  invalid: string[];
  duplicates: string[];
  overLimit: string[];
}

/** Splits raw input on whitespace, commas and semicolons, then dedupes and validates. */
export function parseCodes(raw: string, format: RegExp, limit = MAX_CODES_PER_BATCH): ParsedCodes {
  const seen = new Set<string>();
  const result: ParsedCodes = { valid: [], invalid: [], duplicates: [], overLimit: [] };

  for (const token of raw.split(/[\s,;]+/)) {
    const code = token.trim();
    if (!code) continue;
    if (seen.has(code)) {
      result.duplicates.push(code);
      continue;
    }
    seen.add(code);
    if (!format.test(code)) result.invalid.push(code);
    else if (result.valid.length >= limit) result.overLimit.push(code);
    else result.valid.push(code);
  }
  return result;
}

/** Shows only the first and last 4 characters so codes never appear in full in UI or logs. */
export function maskCode(code: string): string {
  if (code.length <= 8) return `${code.slice(0, 2)}****`;
  return `${code.slice(0, 4)}****${code.slice(-4)}`;
}

/** SHA 256 hex, used to remember redeemed codes without storing them. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Picks likely codes out of free text such as a selected social media post.
 * Keeps tokens with a digit, all caps tokens, or long tokens, which drops plain
 * words like "Delta" or "code". The user still reviews the list before running.
 */
export function extractCandidates(text: string, format: RegExp): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;|]+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!format.test(token)) continue;
    const looksLikeCode =
      /\d/.test(token) || (token.length >= 5 && token === token.toUpperCase()) || token.length >= 8;
    if (looksLikeCode) seen.add(token);
  }
  return [...seen];
}

/** Reads codes from an imported file. Our own CSV export keeps only the code column. */
export function codesFromFile(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!/^code,status/i.test(lines[0] ?? '')) return text;
  return lines
    .slice(1)
    .map((line) => line.split(',')[0]?.replace(/^"|"$/g, '') ?? '')
    .filter(Boolean)
    .join('\n');
}

/** Appends codes to a draft, skipping ones already in it. */
export function appendToDraft(draft: string, codes: string[]): string {
  const existing = new Set(draft.split(/[\s,;]+/).filter(Boolean));
  const added = codes.filter((code) => !existing.has(code));
  if (added.length === 0) return draft;
  return [draft.trimEnd(), ...added].filter(Boolean).join('\n');
}
