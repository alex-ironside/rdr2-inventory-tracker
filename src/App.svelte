<script lang="ts">
  import { session } from './lib/session.svelte';
  import Login from './components/Login.svelte';
  import IterationList from './components/IterationList.svelte';
  import TrackerView from './components/TrackerView.svelte';
  import InstallPrompt from './components/InstallPrompt.svelte';
  import ConsentBanner from './components/ConsentBanner.svelte';
  import { initAnalytics, trackPageView } from './lib/analytics';

  let openId = $state<string | null>(null);

  function open(id: string) {
    openId = id;
  }
  function closeToList() {
    openId = null;
  }

  // If the session ends (sign out), drop back to the list view.
  $effect(() => {
    if (!session.isAuthenticated) openId = null;
  });

  // Boot analytics once, in Consent Mode v2 (default-denied until opt-in).
  $effect(() => {
    initAnalytics();
  });

  // The current top-level view, used for GA4 screen_view pageviews.
  const view = $derived(
    !session.ready
      ? null
      : !session.isAuthenticated
        ? 'login'
        : openId
          ? 'tracker'
          : 'list'
  );
  $effect(() => {
    if (view) trackPageView(view);
  });
</script>

<InstallPrompt />
<ConsentBanner />

{#if !session.ready}
  <div class="splash">
    <div class="splash-badge">🤠</div>
    <p class="muted">Loading…</p>
  </div>
{:else if !session.isAuthenticated}
  <Login />
{:else if openId}
  <TrackerView iterationId={openId} onBack={closeToList} />
{:else}
  <IterationList onOpen={open} />
{/if}

<style>
  .splash {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }
  .splash-badge {
    font-size: 3rem;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
      transform: scale(0.96);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
