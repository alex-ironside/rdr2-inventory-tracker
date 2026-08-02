// Date formatting helpers. Pure functions over epoch milliseconds.

const EM_DASH = '—';

/** Long form: "Aug 2, 2026, 06:30 PM" (locale dependent). Returns em dash for 0/falsy. */
export function formatDateTime(ms: number): string {
  if (!ms) return EM_DASH;
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Short form without year: "Aug 2, 06:30 PM". */
export function formatShort(ms: number): string {
  if (!ms) return EM_DASH;
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
