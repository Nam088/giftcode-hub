import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { detectLocale, setLocale, t } from '@/lib/i18n/index.svelte';
import { vi } from '@/lib/i18n/vi';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('locales', () => {
  it('Vietnamese defines every English key and nothing else', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.keys(en) as (keyof typeof en)[])('%s keeps the same placeholders', (key) => {
    expect(placeholders(vi[key])).toEqual(placeholders(en[key]));
  });

  it('has no empty strings', () => {
    for (const text of [...Object.values(en), ...Object.values(vi)])
      expect(text.trim()).not.toBe('');
  });
});

describe('t', () => {
  it('fills placeholders and follows the chosen locale', () => {
    setLocale('en');
    expect(t('redeem.willRun', { count: 3 })).toBe('Will run 3');
    setLocale('vi');
    expect(t('redeem.willRun', { count: 3 })).toBe('Sẽ chạy 3');
  });

  it('detects Vietnamese browsers and defaults to English', () => {
    expect(detectLocale('vi-VN')).toBe('vi');
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('fr-FR')).toBe('en');
  });
});
