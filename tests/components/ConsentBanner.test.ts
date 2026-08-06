import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ConsentBanner from '../../src/components/ConsentBanner.svelte';
import { CONSENT_KEY } from '../../src/lib/consent';
import { isAnalyticsConfigured, setAnalyticsConsent } from '../../src/lib/analytics';

vi.mock('../../src/lib/analytics', () => ({
  isAnalyticsConfigured: vi.fn(() => true),
  setAnalyticsConsent: vi.fn(async () => {})
}));

const mockConfigured = vi.mocked(isAnalyticsConfigured);
const mockSetConsent = vi.mocked(setAnalyticsConsent);

beforeEach(() => {
  localStorage.clear();
  mockConfigured.mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());

describe('ConsentBanner', () => {
  it('renders nothing when analytics is not configured', () => {
    mockConfigured.mockReturnValue(false);
    const { container } = render(ConsentBanner);
    expect(container.textContent?.trim()).toBe('');
  });

  it('offers an opt-in banner on first visit', () => {
    render(ConsentBanner);
    expect(screen.getByRole('region', { name: /analytics consent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Allow analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No thanks/i })).toBeInTheDocument();
  });

  it('grants consent and collapses to an On toggle', async () => {
    render(ConsentBanner);
    await fireEvent.click(screen.getByRole('button', { name: /Allow analytics/i }));

    expect(mockSetConsent).toHaveBeenCalledWith('granted');
    const toggle = screen.getByRole('button', { name: /Usage analytics/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent(/On/);
  });

  it('declines consent and collapses to an Off toggle', async () => {
    render(ConsentBanner);
    await fireEvent.click(screen.getByRole('button', { name: /No thanks/i }));

    expect(mockSetConsent).toHaveBeenCalledWith('denied');
    const toggle = screen.getByRole('button', { name: /Usage analytics/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent(/Off/);
  });

  it('shows the toggle directly when a choice was already made, and withdraws', async () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(ConsentBanner);

    const toggle = screen.getByRole('button', { name: /Usage analytics/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Withdraw consent by toggling off.
    await fireEvent.click(toggle);
    expect(mockSetConsent).toHaveBeenLastCalledWith('denied');
    expect(screen.getByRole('button', { name: /Usage analytics/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // Toggle back on again (denied → granted).
    await fireEvent.click(screen.getByRole('button', { name: /Usage analytics/i }));
    expect(mockSetConsent).toHaveBeenLastCalledWith('granted');
    expect(screen.getByRole('button', { name: /Usage analytics/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
