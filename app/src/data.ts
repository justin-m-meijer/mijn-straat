import AsyncStorage from '@react-native-async-storage/async-storage';

import sample from './sample-feed.json';
import type { Extras, Feed, Profile, Veiligheid, Wijkagent } from './types';

/**
 * Waar de feed vandaan komt. Zet in app/.env:
 *   EXPO_PUBLIC_FEED_URL=http://<ip-van-je-mac>:8787/lingewaard/feed.json
 * Zonder instelling, of als je Mac niet bereikbaar is, toont de app voorbeelddata.
 */
const FEED_URL = process.env.EXPO_PUBLIC_FEED_URL;
const PROFILE_KEY = 'mijnstraat.profile.v1';
const PROFILE_VERSION = 2;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    return resp.ok ? ((await resp.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function loadFeed(): Promise<Feed> {
  const feed = FEED_URL ? await getJson<Feed>(FEED_URL) : null;
  return feed ?? (sample as Feed);
}

/** Wijkagenten en misdrijfcijfers staan naast feed.json; zonder Mac blijven ze leeg. */
export async function loadExtras(): Promise<Extras> {
  if (!FEED_URL) return { wijkagenten: [], veiligheid: null };
  const base = FEED_URL.replace(/[^/]*$/, '');
  const [agents, veiligheid] = await Promise.all([
    getJson<{ wijkagenten: Wijkagent[] }>(`${base}wijkagenten.json`),
    getJson<Veiligheid>(`${base}veiligheid.json`),
  ]);
  return { wijkagenten: agents?.wijkagenten ?? [], veiligheid };
}

export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as Profile;
    // Versie 2 voegt de categorie politie toe; bestaande profielen krijgen die er automatisch bij.
    if ((profile.version ?? 1) < PROFILE_VERSION) {
      if (!profile.topics.includes('politie')) profile.topics = [...profile.topics, 'politie'];
      profile.version = PROFILE_VERSION;
    }
    return profile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, version: PROFILE_VERSION }));
}
