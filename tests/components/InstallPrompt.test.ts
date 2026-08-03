import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import InstallPrompt from '../../src/components/InstallPrompt.svelte';

const DISMISS_KEY = 'rdr2-tracker:install-dismissed';

function setUA(ua: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true
  });
}

function fireBeforeInstall() {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  const prompt = vi.fn(async () => undefined);
  e.prompt = prompt;
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
  return { prompt };
}

beforeEach(() => {
  localStorage.clear();
  setUA('Mozilla/5.0 (Windows NT 10.0)'); // desktop, no prompt by default
  delete (window.navigator as unknown as { standalone?: boolean }).standalone;
});
afterEach(() => vi.restoreAllMocks());

describe('InstallPrompt', () => {
  it('renders nothing on desktop without an install prompt', async () => {
    render(InstallPrompt);
    await tick();
    expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument();
  });

  it('shows a native install CTA after beforeinstallprompt and installs on click', async () => {
    render(InstallPrompt);
    await tick();
    const { prompt } = fireBeforeInstall();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalledOnce();
    // After an accepted install the banner disappears.
    await waitFor(() =>
      expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument()
    );
  });

  it('shows iOS Add-to-Home-Screen instructions on iPhone', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    render(InstallPrompt);
    await tick();
    const btn = await screen.findByRole('button', { name: 'How to install' });
    await fireEvent.click(btn);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    // Toggling again hides the steps.
    await fireEvent.click(screen.getByRole('button', { name: 'Hide steps' }));
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });

  it('can be dismissed and remembers the choice', async () => {
    setUA('Mozilla/5.0 (iPhone)');
    render(InstallPrompt);
    await tick();
    await screen.findByRole('button', { name: 'How to install' });
    await fireEvent.click(screen.getByLabelText('Dismiss install banner'));
    await waitFor(() =>
      expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument()
    );
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
  });

  it('stays hidden when previously dismissed', async () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setUA('Mozilla/5.0 (iPhone)');
    render(InstallPrompt);
    await tick();
    expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument();
  });

  it('hides when the app reports it is already installed (appinstalled)', async () => {
    render(InstallPrompt);
    await tick();
    fireBeforeInstall();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    );
    window.dispatchEvent(new Event('appinstalled'));
    await waitFor(() =>
      expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument()
    );
  });

  // Swap the whole `localStorage` global for a stub so the throw is guaranteed
  // to reach the component regardless of the host's Storage implementation.
  // `vi.spyOn(localStorage, …)` is unreliable across Node versions: under the
  // Node 24+ built-in Web Storage the spy can silently fail to intercept, so
  // the component's try/catch never runs and its error paths go uncovered.
  async function withStorage(overrides: Partial<Storage>, run: () => Promise<void>) {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const stub: Storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
      ...overrides
    };
    Object.defineProperty(window, 'localStorage', { value: stub, configurable: true });
    try {
      await run();
    } finally {
      if (real) Object.defineProperty(window, 'localStorage', real);
    }
  }

  it('still renders when localStorage reads throw (private mode)', async () => {
    await withStorage(
      {
        getItem: () => {
          throw new Error('blocked');
        }
      },
      async () => {
        setUA('Mozilla/5.0 (iPhone)');
        render(InstallPrompt);
        await tick();
        // readDismissed swallowed the error and defaulted to not-dismissed.
        expect(await screen.findByRole('button', { name: 'How to install' })).toBeInTheDocument();
      }
    );
  });

  it('dismisses safely even when localStorage writes throw', async () => {
    await withStorage(
      {
        setItem: () => {
          throw new Error('blocked');
        }
      },
      async () => {
        setUA('Mozilla/5.0 (iPhone)');
        render(InstallPrompt);
        await tick();
        await screen.findByRole('button', { name: 'How to install' });
        await fireEvent.click(screen.getByLabelText('Dismiss install banner'));
        await waitFor(() =>
          expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument()
        );
      }
    );
  });

  it('renders nothing when running in standalone (installed) mode', async () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    setUA('Mozilla/5.0 (iPhone)');
    render(InstallPrompt);
    await tick();
    expect(screen.queryByLabelText('Install this app')).not.toBeInTheDocument();
  });

  it('consults window.matchMedia when available to detect standalone', async () => {
    const matchMedia = vi.fn(() => ({ matches: false }));
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });
    setUA('Mozilla/5.0 (iPhone)');
    render(InstallPrompt);
    await tick();
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
    expect(await screen.findByRole('button', { name: 'How to install' })).toBeInTheDocument();
    // @ts-expect-error cleaning up the stub
    delete window.matchMedia;
  });
});
