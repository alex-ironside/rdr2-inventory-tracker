/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  /** Stripe Price id for the Pro subscription (checkout). */
  readonly VITE_STRIPE_PRICE_ID?: string;
  /** Dev-only: force the Pro path when running a dev build (see session). */
  readonly VITE_DEV_FORCE_PRO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
