import type { ItemStatus } from './job';

export type Tone = 'accent' | 'danger' | 'warn' | 'info' | 'muted';

export const STATUS_TONE: Record<ItemStatus, Tone> = {
  pending: 'muted',
  inFlight: 'info',
  unknown: 'warn',
  success: 'accent',
  invalid: 'danger',
  used: 'muted',
  expired: 'danger',
};

/** Display order for result filters and counters. */
export const STATUS_ORDER: readonly ItemStatus[] = [
  'success',
  'used',
  'invalid',
  'expired',
  'unknown',
  'pending',
];
