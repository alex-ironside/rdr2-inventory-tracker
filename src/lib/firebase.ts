// Lazy Firebase initialisation. Config comes from Vite env vars (VITE_FIREBASE_*)
// so nothing sensitive is hard-coded and the same build works across projects.
//
// Firebase web config values are NOT secrets (they identify the project and are
// shipped to every browser); access is protected by Firestore security rules and
// Firebase Auth, not by hiding these values. See firestore.rules.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // Optional: enables Google Analytics (GA4). See analytics.ts.
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/** True when the build was given a Firebase config. When false the app runs
 *  in local-only mode and never touches the network. */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Set the VITE_FIREBASE_* environment variables ' +
        '(see .env.example) or use offline mode.'
    );
  }
  if (!app) app = initializeApp(config);
  return app;
}

/** The initialised Firebase app. Throws when Firebase is not configured. Used
 *  by analytics.ts, which shares the same app instance. */
export function getFirebaseApp(): FirebaseApp {
  return ensureApp();
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    // Offline persistence: cache Firestore data locally so the app keeps working
    // without a connection and syncs when it returns.
    dbInstance = initializeFirestore(ensureApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  }
  return dbInstance;
}
