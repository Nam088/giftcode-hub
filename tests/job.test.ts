import { describe, expect, it } from 'vitest';
import {
  canTransition,
  countByStatus,
  createJob,
  nextPendingIndex,
  recoverInterrupted,
  requeue,
  transition,
} from '@/lib/job';

describe('item transitions', () => {
  it('allows pending to inFlight to a result', () => {
    const item = transition({ code: 'X', status: 'pending' }, 'inFlight');
    expect(transition(item, 'success', 'ok').status).toBe('success');
  });

  it('never retries an item that already has a result', () => {
    expect(canTransition('used', 'pending')).toBe(false);
    expect(canTransition('success', 'inFlight')).toBe(false);
  });

  it('does not let unknown go back to pending automatically', () => {
    expect(canTransition('unknown', 'pending')).toBe(false);
    expect(canTransition('unknown', 'inFlight')).toBe(false);
  });

  it('throws on an invalid transition', () => {
    expect(() => transition({ code: 'X', status: 'pending' }, 'success')).toThrow();
  });
});

describe('createJob', () => {
  it('starts paused with all items pending', () => {
    const job = createJob(['A', 'B'], 1, 'acc', 'semi');
    expect(job.status).toBe('paused');
    expect(nextPendingIndex(job)).toBe(0);
  });
});

describe('requeue', () => {
  it('puts an unknown item back to pending on explicit user action', () => {
    expect(requeue({ code: 'X', status: 'unknown' }).status).toBe('pending');
  });

  it('refuses to requeue an item with a final result', () => {
    expect(() => requeue({ code: 'X', status: 'used' })).toThrow();
  });
});

describe('recoverInterrupted', () => {
  it('pauses a running job and marks the inFlight item unknown', () => {
    const job = { ...createJob(['A', 'B'], 1, 'acc', 'auto'), status: 'running' as const };
    job.items[0] = { code: 'A', status: 'inFlight' };
    const recovered = recoverInterrupted(job);
    expect(recovered.status).toBe('paused');
    expect(recovered.items[0]?.status).toBe('unknown');
    expect(recovered.items[1]?.status).toBe('pending');
  });

  it('leaves paused jobs untouched', () => {
    const job = createJob(['A'], 1, 'acc', 'auto');
    expect(recoverInterrupted(job)).toBe(job);
  });
});

describe('countByStatus', () => {
  it('counts every status', () => {
    const counts = countByStatus([
      { code: 'A', status: 'success' },
      { code: 'B', status: 'used' },
      { code: 'C', status: 'used' },
    ]);
    expect(counts.success).toBe(1);
    expect(counts.used).toBe(2);
    expect(counts.pending).toBe(0);
  });
});
