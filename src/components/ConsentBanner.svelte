<script lang="ts">
  // Analytics consent UI (GDPR / Google Consent Mode v2).
  //
  // When a GA4 measurement id is configured, first-time visitors see an opt-in
  // banner; nothing is collected until they choose (analytics loads in the
  // default-denied state). After a choice is made the banner collapses to a
  // small toggle so consent can be changed or withdrawn at any time — a GDPR
  // requirement. When analytics is not configured this renders nothing.
  import { isAnalyticsConfigured, setAnalyticsConsent } from '../lib/analytics';
  import { readConsent, type ConsentChoice, type ConsentState } from '../lib/consent';

  const available = isAnalyticsConfigured();
  let choice = $state<ConsentState>(readConsent());

  async function decide(next: ConsentChoice) {
    choice = next;
    await setAnalyticsConsent(next);
  }

  function toggle() {
    decide(choice === 'granted' ? 'denied' : 'granted');
  }
</script>

{#if available}
  {#if choice === 'unset'}
    <div class="consent" role="region" aria-label="Usage analytics consent">
      <span class="ico" aria-hidden="true">📊</span>
      <div class="msg">
        <strong>Help improve the tracker?</strong>
        <span class="sub">
          Allow anonymous usage analytics (Google Analytics). No ads, no data
          sold — you can change this any time. Choosing “No thanks” keeps
          everything off.
        </span>
      </div>
      <div class="actions">
        <button class="btn" onclick={() => decide('granted')}>Allow analytics</button>
        <button class="btn-ghost" onclick={() => decide('denied')}>No thanks</button>
      </div>
    </div>
  {:else}
    <div class="consent-toggle">
      <button
        class="btn-ghost"
        aria-pressed={choice === 'granted'}
        onclick={toggle}
      >
        <span aria-hidden="true">📊</span>
        Usage analytics: <strong>{choice === 'granted' ? 'On' : 'Off'}</strong>
      </button>
    </div>
  {/if}
{/if}

<style>
  .consent {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.7rem 1rem;
    background: linear-gradient(180deg, #1a2233, #131a26);
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
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
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .consent-toggle {
    display: flex;
    justify-content: flex-end;
    padding: 0.35rem 1rem;
  }
  .consent-toggle .btn-ghost {
    font-size: 0.78rem;
    color: var(--text-dim);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .consent-toggle strong {
    color: var(--text);
  }
</style>
