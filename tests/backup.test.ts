import { describe, expect, it } from 'vitest';
import { MIN_DELAY_MS, parseBackup } from '@/lib/storage';

const valid = {
  app: 'gift-code-redeemer',
  version: 1,
  exportedAt: 1,
  settings: { mode: 'semi', delayMs: 100 },
  knownCodes: { Nam: { abc: 'used' } },
  history: [],
};

describe('parseBackup', () => {
  it('accepts our own backup and fills missing settings', () => {
    const backup = parseBackup(JSON.stringify(valid));
    expect(backup.settings.mode).toBe('semi');
    expect(backup.settings.notify).toBe(true);
    expect(backup.knownCodes.Nam?.abc).toBe('used');
  });

  it('never lets a backup lower the delay floor', () => {
    expect(parseBackup(JSON.stringify(valid)).settings.delayMs).toBe(MIN_DELAY_MS);
  });

  it('rejects files from somewhere else', () => {
    expect(() => parseBackup(JSON.stringify({ foo: 1 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...valid, knownCodes: null }))).toThrow();
  });
});
