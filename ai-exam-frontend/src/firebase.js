import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"];
const hasFirebaseConfig = requiredConfigKeys.every((key) =>
  Boolean(firebaseConfig[key])
);

const firebaseApp = hasFirebaseConfig
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

// ✅ ADD THESE TWO LINES
if (firebaseAuth && import.meta.env.DEV) {
  firebaseAuth.settings.appVerificationDisabledForTesting = true;
}

export { firebaseAuth, hasFirebaseConfig };
