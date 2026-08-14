import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const firebaseConfig: Record<string, string | undefined> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

const hasFirebaseConfig = requiredConfigKeys.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === "string" && value.trim().length > 0;
});

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let analytics: Analytics | null | undefined = undefined; // undefined = not checked yet

export function getFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig) return null;

  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig as FirebaseOptions);
  }

  return app;
}

export function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  if (!db) {
    db = getFirestore(firebaseApp);
  }

  return db;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null; // SSR guard

  if (analytics !== undefined) return analytics;

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    analytics = null;
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    analytics = null;
    return null;
  }

  analytics = getAnalytics(firebaseApp);
  return analytics;
}

export const isFirebaseConfigured = hasFirebaseConfig;


