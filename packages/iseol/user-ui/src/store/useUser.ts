import { useState, useEffect } from 'react';
import { getProfile, loadProfile, subscribe, type UserProfile } from './userStore';

export function useUser(): UserProfile {
  const [profile, setProfileState] = useState(getProfile);
  useEffect(() => {
    void loadProfile();
    return subscribe(() => setProfileState({ ...getProfile() }));
  }, []);
  return profile;
}
