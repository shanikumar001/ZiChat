'use client';

// Firebase credentials & configuration
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCPVVB51jADrPFSYsRjBuCddcGPlgrp36E',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || 'proworkers-d78b3.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'proworkers-d78b3',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'proworkers-d78b3.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '525333870881',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '1:525333870881:web:83d9d790b2a326a5696660',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-G35C660HGE',
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firebase?: any;
  }
}

/** Helper to dynamically load Firebase compat scripts if not already loaded */
export async function loadFirebaseSDK(): Promise<NonNullable<Window['firebase']>> {
  if (typeof window === 'undefined') {
    throw new Error('Firebase SDK can only be loaded in the browser');
  }

  if (window.firebase?.auth) {
    return window.firebase;
  }

  // Load app script
  if (!window.firebase) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Firebase App script'));
      document.head.appendChild(script);
    });
  }

  // Load auth script
  if (!window.firebase?.auth) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Firebase Auth script'));
      document.head.appendChild(script);
    });
  }

  if (!window.firebase.apps || window.firebase.apps.length === 0) {
    window.firebase.initializeApp(firebaseConfig);
  }

  return window.firebase;
}

export interface FirebaseAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  idToken?: string;
}

/** Trigger Google Sign-In popup using Firebase Auth */
export async function signInWithGoogle(): Promise<FirebaseAuthUser> {
  const firebase = await loadFirebaseSDK();
  const provider = new firebase.auth.GoogleAuthProvider();
  
  // Custom parameters
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await firebase.auth().signInWithPopup(provider);
  const user = result.user;

  if (!user) {
    throw new Error('Google sign-in was cancelled or failed.');
  }

  const idToken = await user.getIdToken();

  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'ZiChat User',
    photoURL: user.photoURL || '',
    idToken,
  };
}
