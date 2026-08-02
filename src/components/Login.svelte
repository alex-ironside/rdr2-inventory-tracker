<script lang="ts">
  import { session } from '../lib/session.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    await session.signIn(email, password);
    busy = false;
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
            autocomplete="current-password"
            bind:value={password}
            placeholder="••••••••"
            required
          />
        </label>

        {#if session.authError}
          <p class="err" role="alert">{session.authError}</p>
        {/if}

        <button class="btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

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
      Accounts are created by the owner in the Firebase console. There is no public sign-up.
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
