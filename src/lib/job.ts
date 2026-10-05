export type ResultStatus = 'success' | 'invalid' | 'used' | 'expired';
export type ItemStatus = 'pending' | 'inFlight' | 'unknown' | ResultStatus;
export type JobStatus = 'running' | 'paused' | 'done';
export type PauseReason =
  | 'user'
  | 'login_required'
  | 'captcha'
  | 'rate_limited'
  | 'needs_review'
  | 'tab_lost'
  | 'tab_hidden'
  | 'error';
export type RunMode = 'auto' | 'semi';

export interface JobItem {
  code: string;
  status: ItemStatus;
  /** Raw message shown by the site, kept so the user can judge unknown results. */
  message?: string;
  /** When the item last changed status. */
  at?: number;
}

export interface Job {
  id: string;
  tabId: number;
  /** Account name shown on the site when the job started, used to key known codes. */
  account: string;
  mode: RunMode;
  status: JobStatus;
  pauseReason?: PauseReason;
  /** Extra detail for the pause, for example the error text. */
  pauseDetail?: string;
  items: JobItem[];
  createdAt: number;
  finishedAt?: number;
}

const TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  pending: ['inFlight'],
  // Back to pending is allowed only when the failure happened before submit
  inFlight: ['pending', 'unknown', 'success', 'invalid', 'used', 'expired'],
  // Unknown is resolved by the user after checking the site, never by auto retry
  unknown: ['success', 'invalid', 'used', 'expired'],
  success: [],
  invalid: [],
  used: [],
  expired: [],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(item: JobItem, to: ItemStatus, message?: string): JobItem {
  if (!canTransition(item.status, to)) {
    throw new Error(`Invalid item transition ${item.status} to ${to}`);
  }
  return { ...item, status: to, message: message ?? item.message, at: Date.now() };
}

export function isTerminal(status: ItemStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Explicit user action only: puts an unknown item back in the queue after they checked the site. */
export function requeue(item: JobItem): JobItem {
  if (item.status !== 'unknown') throw new Error(`Cannot requeue ${item.status}`);
  return { ...item, status: 'pending' };
}

export type StatusCounts = Record<ItemStatus, number>;

export function countByStatus(items: readonly JobItem[]): StatusCounts {
  const counts: StatusCounts = {
    pending: 0,
    inFlight: 0,
    unknown: 0,
    success: 0,
    invalid: 0,
    used: 0,
    expired: 0,
  };
  for (const item of items) counts[item.status]++;
  return counts;
}

/**
 * A job found as running when the side panel opens was interrupted (panel closed,
 * browser restarted). It is paused, and an inFlight item becomes unknown because
 * we cannot tell whether its submit reached the site.
 */
export function recoverInterrupted(job: Job): Job {
  if (job.status !== 'running') return job;
  return {
    ...job,
    status: 'paused',
    pauseReason: 'needs_review',
    pauseDetail: 'Phiên chạy trước bị gián đoạn',
    items: job.items.map((item) =>
      item.status === 'inFlight' ? { ...item, status: 'unknown' } : item,
    ),
  };
}

export function nextPendingIndex(job: Job): number {
  return job.items.findIndex((item) => item.status === 'pending');
}

export function createJob(codes: string[], tabId: number, account: string, mode: RunMode): Job {
  return {
    id: crypto.randomUUID(),
    tabId,
    account,
    mode,
    status: 'paused',
    pauseReason: 'user',
    items: codes.map((code) => ({ code, status: 'pending' })),
    createdAt: Date.now(),
  };
}
