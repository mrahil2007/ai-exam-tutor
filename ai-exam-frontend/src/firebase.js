import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,"AIzaSyAhRX2lb2l5lLMQ7izROfiy_zxpNoB4jA0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "examai-6d2e8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, "examai-6d2e8",
  appId:  import.meta.env.VITE_FIREBASE_APP_ID, "1:909950827508:web:6ebbe403d54f128dec57a1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "examai-6d2e8.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "909950827508",
  measurementId: "G-546Z100CW2",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
