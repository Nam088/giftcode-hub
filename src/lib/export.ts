import type { JobItem } from './job';

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(items: readonly JobItem[]): string {
  const rows = items.map((item) =>
    [item.code, item.status, item.message ?? ''].map(csvCell).join(','),
  );
  return ['code,status,message', ...rows].join('\n');
}

/** Triggers a file download from an extension page without the downloads permission. */
export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
