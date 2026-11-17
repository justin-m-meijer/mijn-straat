import AsyncStorage from '@react-native-async-storage/async-storage';

import sample from './sample-feed.json';
import type { Cijfers, Extras, Feed, Meting, Omgeving, Profile, Veiligheid, Wijkagent } from './types';

/**
 * Waar de feed vandaan komt. Zet in app/.env één of meer adressen, gescheiden door komma's:
 *   EXPO_PUBLIC_FEED_URL=http://<ip-van-je-mac>:8787/lingewaard/feed.json,https://justin-m-meijer.github.io/mijn-straat/lingewaard/feed.json
 * De app probeert ze op volgorde: thuis de volledige feed van je Mac, onderweg de online kopie.
 * De map in de URL ('lingewaard') wordt vervangen door de gemeente van het adres, bijvoorbeeld 'amsterdam'.
 * Lukt geen enkele, dan toont de app voorbeelddata (Lingewaard) of meldt dat de gemeente er nog niet is.
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

const DEFAULT_GEMEENTE = 'Lingewaard';

/** Zelfde mapnaam als de pijplijn (`_slug`): kleine letters, spaties worden streepjes. */
export function gemeenteSlug(gemeente: string): string {
  return gemeente.trim().toLowerCase().replace(/\s+/g, '-');
}

/** De feed-URL's uit .env, met de map van de gemeente van het adres. */
export function feedUrls(urls: string[], gemeente: string): string[] {
  const slug = gemeenteSlug(gemeente);
  return urls.map((u) => u.replace(/[^/]+\/feed\.json$/, `${slug}/feed.json`));
}

export async function loadFeed(gemeente: string = DEFAULT_GEMEENTE): Promise<Feed> {
  for (const url of feedUrls(FEED_URLS, gemeente)) {
    const feed = await getJson<Feed>(url);
    if (feed) {
      activeBase = url.replace(/[^/]*$/, '');
      return feed;
    }
  }
  activeBase = null;
  if (FEED_URLS.length && gemeenteSlug(gemeente) !== gemeenteSlug(DEFAULT_GEMEENTE)) {
    return { gemeente, generated_at: '', model: null, stats: { items: 0, located: 0 }, items: [], unavailable: true };
  }
  return sample as Feed;
}

/**
 * Wijkagenten, misdrijfcijfers en wonen/economie staan naast de feed die lukte.
 * De online kopie heeft geen wijkagenten (licentie politie-API); dan blijft die lijst leeg.
 */
export const EMPTY_EXTRAS: Extras = { wijkagenten: [], veiligheid: null, cijfers: null, omgeving: null };

export async function loadExtras(): Promise<Extras> {
  if (!activeBase) return EMPTY_EXTRAS;
  const [agents, veiligheid, cijfers, omgeving] = await Promise.all([
    getJson<{ wijkagenten: Wijkagent[] }>(`${activeBase}wijkagenten.json`),
    getJson<Veiligheid>(`${activeBase}veiligheid.json`),
    getJson<Cijfers>(`${activeBase}cijfers.json`),
    getJson<Omgeving>(`${activeBase}omgeving.json`),
  ]);
  return { wijkagenten: agents?.wijkagenten ?? [], veiligheid, cijfers, omgeving };
}

const LUCHTMEETNET = 'https://api.luchtmeetnet.nl/open_api';

type LmnRow = { formula: string; value: number | null; timestamp_measured: string };

/**
 * Actuele uurwaarden rechtstreeks bij Luchtmeetnet: de feed van de Mac is hooguit een dag oud,
 * luchtkwaliteit verandert per uur. Open API zonder sleutel (fair use: 100 verzoeken per 5 minuten
 * per afzender); de app vraagt per station twee dingen op. Lukt het niet, dan blijft de waarde uit de feed staan.
 */
export async function loadLiveLucht(station: string): Promise<Record<string, Meting> | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 3600 * 1000);
  // Met start en end geen omweg via een redirect.
  const q = `station_number=${station}&start=${start.toISOString().slice(0, 19)}Z&end=${end.toISOString().slice(0, 19)}Z&order_by=timestamp_measured&order_direction=desc`;
  const [m, lki] = await Promise.all([
    getJson<{ data: LmnRow[] }>(`${LUCHTMEETNET}/measurements?${q}`),
    getJson<{ data: LmnRow[] }>(`${LUCHTMEETNET}/lki?${q}`),
  ]);
  if (!m && !lki) return null;
  const out: Record<string, Meting> = {};
  for (const r of [...(m?.data ?? []), ...(lki?.data ?? [])]) {
    if (r.value == null || !r.timestamp_measured) continue;
    const prev = out[r.formula];
    if (!prev || r.timestamp_measured > prev.tijd) out[r.formula] = { waarde: r.value, tijd: r.timestamp_measured };
  }
  return out;
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

/** Luchtkwaliteitsindex per uur over de afgelopen 24 uur, oud naar nieuw. Past op één pagina (100 per pagina). */
export async function loadLkiDag(station: string): Promise<Meting[] | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const q = `station_number=${station}&start=${start.toISOString().slice(0, 19)}Z&end=${end.toISOString().slice(0, 19)}Z&order_by=timestamp_measured&order_direction=asc`;
  const body = await getJson<{ data: LmnRow[] }>(`${LUCHTMEETNET}/lki?${q}`);
  if (!body) return null;
  return body.data
    .filter((r) => r.value != null && r.timestamp_measured)
    .map((r) => ({ waarde: r.value as number, tijd: r.timestamp_measured }))
    .sort((a, b) => (a.tijd < b.tijd ? -1 : 1));
}
