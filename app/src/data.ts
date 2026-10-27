import AsyncStorage from '@react-native-async-storage/async-storage';

import sample from './sample-feed.json';
import type { Cijfers, Extras, Feed, Profile, Veiligheid, Wijkagent } from './types';

/**
 * Waar de feed vandaan komt. Zet in app/.env één of meer adressen, gescheiden door komma's:
 *   EXPO_PUBLIC_FEED_URL=http://<ip-van-je-mac>:8787/lingewaard/feed.json,https://justin-m-meijer.github.io/mijn-straat/lingewaard/feed.json
 * De app probeert ze op volgorde: thuis de volledige feed van je Mac, onderweg de online kopie.
 * Lukt geen enkele, dan toont de app voorbeelddata.
 */
const FEED_URLS = (process.env.EXPO_PUBLIC_FEED_URL ?? '')
  .split(',')
  .map((u: string) => u.trim())
  .filter(Boolean);
const PROFILE_KEY = 'mijnstraat.profile.v1';
const PROFILE_VERSION = 2;
// Een Mac op het thuisnetwerk antwoordt snel; onderweg willen we niet lang wachten op dat adres.
const TIMEOUT_MS = 3000;

// Map van de feed die het laatst lukte; de extra bestanden staan daarnaast.
let activeBase: string | null = null;

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: controller.signal });
    return resp.ok ? ((await resp.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadFeed(): Promise<Feed> {
  for (const url of FEED_URLS) {
    const feed = await getJson<Feed>(url);
    if (feed) {
      activeBase = url.replace(/[^/]*$/, '');
      return feed;
    }
  }
  activeBase = null;
  return sample as Feed;
}

/**
 * Wijkagenten, misdrijfcijfers en wonen/economie staan naast de feed die lukte.
 * De online kopie heeft geen wijkagenten (licentie politie-API); dan blijft die lijst leeg.
 */
export const EMPTY_EXTRAS: Extras = { wijkagenten: [], veiligheid: null, cijfers: null };

export async function loadExtras(): Promise<Extras> {
  if (!activeBase) return EMPTY_EXTRAS;
  const [agents, veiligheid, cijfers] = await Promise.all([
    getJson<{ wijkagenten: Wijkagent[] }>(`${activeBase}wijkagenten.json`),
    getJson<Veiligheid>(`${activeBase}veiligheid.json`),
    getJson<Cijfers>(`${activeBase}cijfers.json`),
  ]);
  return { wijkagenten: agents?.wijkagenten ?? [], veiligheid, cijfers };
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
