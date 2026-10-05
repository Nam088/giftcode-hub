import { en, type MessageKey } from './en';
import { vi } from './vi';

export type { MessageKey } from './en';
export type Locale = 'en' | 'vi';
export type LocalePreference = 'auto' | Locale;
export type Params = Record<string, string | number>;

/** A translatable message passed around instead of a finished string. */
export interface Msg {
  key: MessageKey;
  params?: Params;
}

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, vi };
export const LOCALES: readonly Locale[] = ['vi', 'en'];
export const LOCALE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };

export function detectLocale(language = globalThis.navigator?.language ?? 'en'): Locale {
  return language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

let current = $state<Locale>(detectLocale());

export function setLocale(preference: LocalePreference): void {
  current = preference === 'auto' ? detectLocale() : preference;
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function getLocale(): Locale {
  return current;
}

export function isMessageKey(value: string): value is MessageKey {
  return value in en;
}

/** Reactive in Svelte templates: reading `current` makes callers update on locale change. */
export function t(key: MessageKey, params?: Params): string {
  const text = DICTIONARIES[current][key] ?? en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function tm(message: Msg): string {
  return t(message.key, message.params);
}

/** Error messages thrown with a message key are translated, anything else is shown as is. */
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return isMessageKey(text) ? t(text) : text;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(current === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(current === 'vi' ? 'vi-VN' : 'en-GB', { hour12: false });
}
