<script lang="ts">
  // Account + billing controls for a signed-in user:
  //   * free  → "Upgrade to Pro" (Stripe Checkout) to unlock cloud sync
  //   * Pro   → "Manage billing" (Stripe portal)
  //   * both  → "Delete account" (GDPR erasure, password-confirmed)
  //
  // Offline (not signed-in) sessions render nothing here.
  import { session } from '../lib/session.svelte';
  import { FirebaseBillingBackend } from '../lib/billing';

  const priceId = import.meta.env.VITE_STRIPE_PRICE_ID;

  let busy = $state(false);
  let error = $state<string | null>(null);
  let confirming = $state(false);
  let password = $state('');

  // Returning from a successful Stripe Checkout: pick up the freshly-granted Pro
  // claim and tidy the marker out of the URL.
  $effect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('checkout') === 'success') {
      session.refreshEntitlement();
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    }
  });

  function billing(): FirebaseBillingBackend {
    return new FirebaseBillingBackend(session.user!.uid);
  }

  async function upgrade() {
    error = null;
    if (!priceId) {
      error = 'Billing is not configured yet.';
      return;
    }
    busy = true;
    try {
      const base = window.location.origin + window.location.pathname;
      const url = await billing().startCheckout({
        priceId,
        successUrl: `${base}?checkout=success`,
        cancelUrl: base
      });
      window.location.assign(url);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function manageBilling() {
    error = null;
    busy = true;
    try {
      const url = await billing().openBillingPortal(window.location.href);
      window.location.assign(url);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function confirmDelete(e: Event) {
    e.preventDefault();
    error = null;
    busy = true;
    const ok = await session.deleteAccount(password);
    busy = false;
    password = '';
    if (ok) {
      confirming = false;
    } else {
      error = session.authError;
    }
  }
</script>

{#if session.signedIn}
  <div class="account-bar card" role="region" aria-label="Account and billing">
    <div class="status">
      {#if session.pro}
        <strong class="tier pro">✔ Pro</strong>
        <span class="muted">Cloud sync is on across your devices.</span>
      {:else}
        <strong class="tier free">Free plan</strong>
        <span class="muted">Playthroughs stay on this device. Upgrade to sync to the cloud.</span>
      {/if}
    </div>

    <div class="actions">
      {#if session.pro}
        <button class="btn" onclick={manageBilling} disabled={busy}>Manage billing</button>
      {:else}
        <button class="btn" onclick={upgrade} disabled={busy}>
          {busy ? 'Starting…' : 'Upgrade to Pro'}
        </button>
      {/if}
      <button class="btn-ghost danger" onclick={() => (confirming = true)}>Delete account</button>
    </div>

    {#if error}
      <p class="err" role="alert">{error}</p>
    {/if}

    {#if confirming}
      <form class="danger-zone" onsubmit={confirmDelete}>
        <p class="warn">
          This permanently deletes your account and every cloud playthrough. This cannot be
          undone. Enter your password to confirm.
        </p>
        <input
          class="input"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          aria-label="Confirm password"
          placeholder="Your password"
          required
        />
        <div class="actions">
          <button class="btn danger-btn" type="submit" disabled={busy}>
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
          <button class="btn-ghost" type="button" onclick={() => (confirming = false)}>
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </div>
{/if}

<style>
  .account-bar {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem 1rem;
  }
  .status {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .tier {
    font-size: 0.95rem;
  }
  .tier.pro {
    color: var(--good, #6fcf97);
  }
  .tier.free {
    color: var(--accent-2);
  }
  .muted {
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .danger {
    color: #e88b74;
  }
  .err {
    color: #e88b74;
    background: #b5462f22;
    border: 1px solid #b5462f55;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    margin: 0;
    font-size: 0.86rem;
  }
  .danger-zone {
    border: 1px solid #b5462f66;
    background: #b5462f14;
    border-radius: 8px;
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .warn {
    margin: 0;
    font-size: 0.84rem;
    color: var(--text-dim);
    line-height: 1.45;
  }
  .danger-btn {
    background: #b5462f;
    border-color: #b5462f;
  }
</style>
