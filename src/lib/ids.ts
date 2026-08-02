// ID generation, isolated so it can be tested and mocked independently.

/** Random suffix using crypto when available, falling back to Math.random. */
export function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  }
  return Math.random().toString(36).slice(2);
}

/** Generate a collision-resistant iteration id. */
export function generateId(prefix = 'it'): string {
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${randomSuffix()}`;
}
