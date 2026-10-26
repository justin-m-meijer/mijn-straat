import AsyncStorage from '@react-native-async-storage/async-storage';

import sample from './sample-feed.json';
import type { Feed, Profile } from './types';

/**
 * Waar de feed vandaan komt. Zet in app/.env:
 *   EXPO_PUBLIC_FEED_URL=http://<ip-van-je-mac>:8787/lingewaard/feed.json
 * Zonder instelling, of als je Mac niet bereikbaar is, toont de app voorbeelddata.
 */
const FEED_URL = process.env.EXPO_PUBLIC_FEED_URL;
const PROFILE_KEY = 'mijnstraat.profile.v1';

export async function loadFeed(): Promise<Feed> {
  if (FEED_URL) {
    try {
      const resp = await fetch(FEED_URL, { headers: { 'Cache-Control': 'no-cache' } });
      if (resp.ok) return (await resp.json()) as Feed;
    } catch {
      // val terug op voorbeelddata
    }
  }
  return sample as Feed;
}

export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
