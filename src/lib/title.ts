// Title normalisation, shared by every backend so the rule lives in one place.

export const DEFAULT_TITLE = 'Untitled Playthrough';
export const MAX_TITLE_LENGTH = 80;

// Strip ASCII control characters (defensive input validation, ISO/IEC 27002).
// Built from a string so no literal control bytes appear in source. The control
// range is intentional here, so the no-control-regex rule is disabled.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

/** Trim, remove control characters, bound the length, and fall back to a
 *  default when the result is empty. */
export function normalizeTitle(input: string): string {
  const cleaned = (input ?? '').replace(CONTROL_CHARS, '').trim().slice(0, MAX_TITLE_LENGTH);
  return cleaned || DEFAULT_TITLE;
}
