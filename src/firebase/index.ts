'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    // Important! initializeApp() is called without any arguments because Firebase App Hosting
    // integrates with the initializeApp() function to provide the environment variables needed to
    // populate the FirebaseOptions in production. It is critical that we attempt to call initializeApp()
    // without arguments.
    let firebaseApp;
    try {
      // Attempt to initialize via Firebase App Hosting environment variables
      firebaseApp = initializeApp();
    } catch (e) {
      // Only warn in production because it's normal to use the firebaseConfig to initialize
      // during development
      if (process.env.NODE_ENV === "production") {
        console.warn('Automatic initialization failed. Falling back to firebase config object.', e);
      }
      firebaseApp = initializeApp(firebaseConfig);
    }

    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  let firestore = null;
  try {
    // Attempt to initialize with long polling auto-detection for unstable networks
    firestore = initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true });
  } catch (e) {
    // If already initialized, fallback to getFirestore
    try {
      firestore = getFirestore(firebaseApp);
    } catch (err) {
      console.warn("Firestore initialization failed:", err);
    }
  }

  let auth = null;
  try {
    auth = getAuth(firebaseApp);
  } catch (e) {
    console.warn("Auth initialization failed (possibly blocked IndexedDB):", e);
  }

  let storage = null;
  try {
    storage = getStorage(firebaseApp);
  } catch (e) {
    console.warn("Storage initialization failed:", e);
  }

  return {
    firebaseApp,
    auth,
    firestore,
    storage
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
