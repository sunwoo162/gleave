import { appendMemory, clearSession, getGrowth, getMe, getWorld, logOut, updateWorld, type CharacterType, type GrowthSnapshot, type MemoryRecord, type UserCharacter, type UserWorld } from '../api/userApi';
import { UserApiError } from '../api/userApi';
import { userFacingError } from '../errorMessage';

export type { CharacterType } from '../api/userApi';

export interface UserProfile {
  id: string;
  email: string;
  timezone: string;
  name: string;
  handle: string;
  character: CharacterType;
  interests: string[];
  activities: string[];
  level: number;
  xp: number;
  xpMax: number;
  isNewUser: boolean;
  isDemoMode: boolean;
  status: 'loading' | 'ready' | 'unauthenticated' | 'error';
  error?: string;
  characterRecord?: UserCharacter;
  growth?: GrowthSnapshot;
}

const defaultProfile: UserProfile = {
  id: '',
  email: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  name: '',
  handle: '',
  character: 'a',
  interests: [],
  activities: [],
  level: 1,
  xp: 0,
  xpMax: 1000,
  isNewUser: true,
  isDemoMode: false,
  status: 'loading',
};

let _profile: UserProfile = { ...defaultProfile };
const _listeners: Array<() => void> = [];
let loadPromise: Promise<UserProfile> | null = null;

export function getProfile(): UserProfile { return _profile; }

export function setProfile(updates: Partial<UserProfile>): void {
  _profile = { ..._profile, ...updates };
  _listeners.forEach((listener) => listener());
}

function profileFrom(world: UserWorld, character: UserCharacter, user: { id: string; email: string; displayName: string; timezone: string }, growth?: GrowthSnapshot): UserProfile {
  return {
    ..._profile,
    id: user.id,
    email: user.email,
    timezone: user.timezone,
    name: world.displayName || user.displayName,
    handle: world.handle,
    character: world.character,
    level: growth?.level ?? 1,
    xp: growth?.xp ?? 0,
    xpMax: growth?.xpMax ?? 1000,
    interests: [...world.interests],
    activities: [...world.activities],
    isNewUser: !world.onboardingCompleted,
    isDemoMode: false,
    status: 'ready',
    error: undefined,
    characterRecord: character,
    ...(growth ? { growth } : {}),
  };
}

export async function loadProfile(): Promise<UserProfile> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [{ user }, { world, character }] = await Promise.all([getMe(), getWorld()]);
      let growth: GrowthSnapshot | undefined;
      try { growth = await getGrowth(); } catch { /* growth is unavailable until the activity service is ready */ }
      _profile = profileFrom(world, character, user, growth);
    } catch (error) {
      if (error instanceof UserApiError && error.status === 401) {
        _profile = { ...defaultProfile, status: 'unauthenticated', error: undefined };
      } else {
        _profile = { ..._profile, status: 'error', error: userFacingError(error, '사용자 정보를 불러오지 못했습니다.') };
      }
    }
    _listeners.forEach((listener) => listener());
    return _profile;
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

export async function completeOnboarding(name: string, character: CharacterType, interests: string[], activities: string[]): Promise<UserProfile> {
  const result = await updateWorld({ displayName: name.trim() || '이설 사용자', character, interests, activities, onboardingCompleted: true });
  const user = _profile.id && _profile.email ? { id: _profile.id, email: _profile.email, displayName: name, timezone: _profile.timezone } : (await getMe()).user;
  let growth: GrowthSnapshot | undefined;
  try { growth = await getGrowth(); } catch { /* preserve onboarding even when growth is unavailable */ }
  _profile = profileFrom(result.world, result.character, user, growth);
  _listeners.forEach((listener) => listener());
  return _profile;
}

export async function saveMemory(input: { kind: string; content: string; source?: string }): Promise<MemoryRecord> {
  const result = await appendMemory(input);
  return result.memory;
}

export async function signOut(): Promise<void> {
  try { await logOut(); } catch { clearSession(); }
  _profile = { ...defaultProfile, status: 'unauthenticated' };
  _listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  _listeners.push(listener);
  return () => {
    const index = _listeners.indexOf(listener);
    if (index > -1) _listeners.splice(index, 1);
  };
}
