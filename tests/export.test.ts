import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/export';

describe('toCsv', () => {
  it('writes a header and one row per item', () => {
    const csv = toCsv([
      { code: 'AAA', status: 'success', message: 'ok' },
      { code: 'BBB', status: 'pending' },
    ]);
    expect(csv).toBe('code,status,message\nAAA,success,ok\nBBB,pending,');
  });

  it('quotes cells with commas, quotes or newlines', () => {
    const csv = toCsv([{ code: 'A', status: 'unknown', message: 'Lỗi, "mạng"' }]);
    expect(csv.split('\n')[1]).toBe('A,unknown,"Lỗi, ""mạng"""');
  });
});
