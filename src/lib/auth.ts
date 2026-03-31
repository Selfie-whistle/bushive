
'use client';

import { Auth, signOut } from 'firebase/auth';

export async function handleSignOut(auth: Auth | null) {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (error) {
    console.error('Error signing out:', error);
  }
}
