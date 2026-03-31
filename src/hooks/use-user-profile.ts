
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';

export function useUserProfile(userId: string | undefined) {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      setUserProfile(null);
      return;
    }

    setIsLoading(true);
    try {
      const profile = await dataService.getUserProfile(userId);
      if (profile) {
        setUserProfile(profile);
      } else {
        // If no profile exists, create a default one
        const defaultProfile = { id: userId, email: '', displayName: '' };
        await dataService.updateUserProfile(userId, defaultProfile);
        setUserProfile(defaultProfile);
      }
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to load user profile:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  
  const updateUserProfile = async (profileData: any) => {
    if (!userId) {
      throw new Error("User not authenticated.");
    }
    await dataService.updateUserProfile(userId, profileData);
    // Optimistically update local state
    setUserProfile(profileData);
  };

  return { userProfile, isLoading, error, updateUserProfile };
}
