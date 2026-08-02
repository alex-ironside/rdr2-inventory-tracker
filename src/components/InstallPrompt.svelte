<script lang="ts">
  import { detectPlatform, isStandalone, installAffordance, type Platform } from '../lib/install';

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const DISMISS_KEY = 'rdr2-tracker:install-dismissed';

  let deferred = $state<BeforeInstallPromptEvent | null>(null);
  let dismissed = $state(readDismissed());
  let showIosSteps = $state(false);
  let platform = $state<Platform>('desktop');
  let standalone = $state(true);

  function readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  $effect(() => {
    platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    standalone = isStandalone({
      matchMedia: typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : undefined,
      navigatorStandalone: (navigator as unknown as { standalone?: boolean }).standalone
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      deferred = null;
      dismissed = true;
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  });

  const affordance = $derived(
    installAffordance({ standalone, platform, hasDeferredPrompt: !!deferred })
  );
  const visible = $derived(!dismissed && affordance !== 'none');

  async function install() {
    if (affordance === 'prompt' && deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      if (choice.outcome === 'accepted') dismissed = true;
    } else {
      showIosSteps = !showIosSteps;
    }
  }

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — dismissing for this session only is fine */
    }
  }
</script>

{#if visible}
  <div class="install" role="region" aria-label="Install this app">
    <span class="ico" aria-hidden="true">🤠</span>
    <div class="msg">
      <strong>Install the tracker</strong>
      <span class="sub">Add it to your home screen for offline, full-screen use.</span>
      {#if showIosSteps && affordance === 'ios-instructions'}
        <ol class="ios-steps">
          <li>Tap the <b>Share</b> button <span aria-hidden="true">􀈂</span> in the toolbar.</li>
          <li>Choose <b>“Add to Home Screen”</b>.</li>
          <li>Tap <b>Add</b> in the top corner.</li>
        </ol>
      {/if}
    </div>
    <div class="actions">
      <button class="btn install-btn" onclick={install}>
        {affordance === 'ios-instructions'
          ? showIosSteps
            ? 'Hide steps'
            : 'How to install'
          : 'Install'}
      </button>
      <button class="btn-ghost close" onclick={dismiss} aria-label="Dismiss install banner"
        >✕</button
      >
    </div>
  </div>
{/if}

<style>
  .install {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.7rem 1rem;
    background: linear-gradient(180deg, #2c2013, #241a11);
    border-bottom: 1px solid var(--line);
  }
  .ico {
    font-size: 1.6rem;
  }
  .msg {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
    min-width: 0;
  }
  .sub {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .ios-steps {
    margin: 0.5rem 0 0.2rem;
    padding-left: 1.2rem;
    font-size: 0.82rem;
    color: var(--text-dim);
    line-height: 1.5;
  }
  .ios-steps b {
    color: var(--text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .install-btn {
    white-space: nowrap;
    padding: 0.4rem 0.8rem;
  }
  .close {
    padding: 0.35rem 0.6rem;
  }
</style>
