<script lang="ts">
  import { session } from '../lib/session.svelte';

  let mode = $state<'signin' | 'register'>('signin');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);

  const registering = $derived(mode === 'register');

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    if (registering) {
      await session.signUp(email, password);
    } else {
      await session.signIn(email, password);
    }
    busy = false;
  }

  function toggleMode() {
    mode = registering ? 'signin' : 'register';
    session.authError = null;
  }

  function useOffline() {
    session.enterLocalMode();
  }
</script>

<div class="wrap">
  <div class="card panel">
    <div class="brand">
      <span class="badge">🤠</span>
      <h1>RDR2 Crafting Tracker</h1>
      <p class="muted sub">Track pelts, feathers &amp; materials across your playthroughs.</p>
    </div>

    {#if session.firebaseAvailable}
      {#if registering}
        <p class="pricing" role="note">
          <strong>💳 Cloud sync is a paid Pro subscription.</strong>
          Creating an account is free, and offline tracking is always free. You’ll only be asked
          to pay if you choose to subscribe to Pro (syncing your playthroughs across devices)
          <em>after</em> signing up.
        </p>
      {/if}

      <form onsubmit={submit} class="form">
        <label>
          <span class="lbl">Email</span>
          <input
            class="input"
            type="email"
            autocomplete="username"
            bind:value={email}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          <span class="lbl">Password</span>
          <input
            class="input"
            type="password"
            autocomplete={registering ? 'new-password' : 'current-password'}
            bind:value={password}
            placeholder="••••••••"
            required
          />
        </label>

        {#if session.authError}
          <p class="err" role="alert">{session.authError}</p>
        {/if}

        <button class="btn" type="submit" disabled={busy}>
          {#if registering}
            {busy ? 'Creating account…' : 'Create free account'}
          {:else}
            {busy ? 'Signing in…' : 'Sign In'}
          {/if}
        </button>
      </form>

      <p class="switch">
        {#if registering}
          Already have an account?
          <button type="button" class="link" onclick={toggleMode}>Sign in</button>
        {:else}
          New here?
          <button type="button" class="link" onclick={toggleMode}>Create an account</button>
        {/if}
      </p>

      <div class="divider"><span>or</span></div>
    {:else}
      <p class="notice">
        Firebase isn't configured for this build — you can still track everything locally on this
        device.
      </p>
    {/if}

    <button class="btn-ghost offline" onclick={useOffline}>
      📴 Continue offline (this device only)
    </button>

    <p class="foot faint">
      Offline mode keeps everything on this device. A free account plus Pro unlocks cloud sync
      across your devices.
    </p>
  </div>
</div>

<style>
  .wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .panel {
    width: 100%;
    max-width: 400px;
    padding: 2rem 1.8rem;
  }
  .brand {
    text-align: center;
    margin-bottom: 1.6rem;
  }
  .badge {
    font-size: 2.6rem;
    display: block;
  }
  h1 {
    font-size: 1.5rem;
    margin-top: 0.4rem;
    color: var(--accent-2);
  }
  .sub {
    font-size: 0.9rem;
    margin-top: 0.4rem;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .lbl {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
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
  .btn {
    margin-top: 0.3rem;
  }
  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    color: var(--text-faint);
    margin: 1.2rem 0 1rem;
    font-size: 0.8rem;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--line-soft);
  }
  .divider span {
    padding: 0 0.7rem;
  }
  .notice {
    background: #2b2013;
    border: 1px solid var(--line-soft);
    border-radius: 8px;
    padding: 0.7rem 0.85rem;
    font-size: 0.86rem;
    color: var(--text-dim);
    margin: 0 0 1rem;
  }
  .pricing {
    background: #16233a;
    border: 1px solid #2c4a6b;
    border-radius: 8px;
    padding: 0.7rem 0.85rem;
    font-size: 0.84rem;
    color: var(--text-dim);
    line-height: 1.45;
    margin: 0 0 1rem;
  }
  .pricing strong {
    display: block;
    color: var(--text);
    margin-bottom: 0.2rem;
  }
  .switch {
    text-align: center;
    font-size: 0.84rem;
    color: var(--text-dim);
    margin: 0.9rem 0 0;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent-2);
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-decoration: underline;
  }
  .offline {
    width: 100%;
  }
  .foot {
    font-size: 0.75rem;
    text-align: center;
    margin: 1.3rem 0 0;
    line-height: 1.4;
  }
</style>
