import type { Feed, NearbyItem, Profile } from './types';

const LOCATIESERVER = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

/** Afstand in meters tussen twee punten (haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Keuzes voor de straal in meters; 0 betekent de hele gemeente. */
export const RADII = [1000, 5000, 10000, 0];
export const WHOLE_GEMEENTE = 0;

export function formatRadius(r: number): string {
  return r === WHOLE_GEMEENTE ? 'Hele gemeente' : formatDistance(r);
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Berichten binnen de straal van de gebruiker, dichtstbij eerst (bij gelijke afstand nieuwste eerst).
 * Berichten zonder locatie die voor de hele gemeente gelden (regels, raad) tellen mee.
 * Dit gebeurt op het toestel: het adres van de gebruiker verlaat de telefoon niet.
 */
export function nearby(feed: Feed, profile: Profile): NearbyItem[] {
  return feed.items
    .filter((i) => profile.topics.includes(i.category) || i.category === 'overig')
    .map((i) => ({
      ...i,
      distance: i.lat != null && i.lon != null ? distanceMeters(profile.lat, profile.lon, i.lat, i.lon) : null,
    }))
    .filter((i) =>
      i.distance == null
        ? i.category === 'regels' || i.category === 'raad'
        : profile.radius === WHOLE_GEMEENTE || i.distance <= profile.radius,
    )
    .sort(byDistanceThenDate);
}

// Berichten zonder locatie (voor de hele gemeente) komen na de berichten met een afstand.
function byDistanceThenDate(a: NearbyItem, b: NearbyItem): number {
  if (a.distance != null && b.distance != null && a.distance !== b.distance) return a.distance - b.distance;
  if (a.distance == null && b.distance != null) return 1;
  if (a.distance != null && b.distance == null) return -1;
  return b.published.localeCompare(a.published);
}

/**
 * Zoek postcode + huisnummer op via de PDOK Locatieserver.
 * Let op: deze vraag gaat rechtstreeks van de telefoon naar PDOK (Kadaster), niet naar onze server.
 */
export async function lookupAddress(postcode: string, huisnummer: string): Promise<{ address: string; lat: number; lon: number } | null> {
  const q = `${postcode.replace(/\s+/g, '')} ${huisnummer.trim()}`;
  const url = `${LOCATIESERVER}?q=${encodeURIComponent(q)}&fq=type:adres&rows=1&fl=weergavenaam,centroide_ll`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`PDOK ${resp.status}`);
  const json = await resp.json();
  const doc = json?.response?.docs?.[0];
  const m = /POINT\((-?[\d.]+) (-?[\d.]+)\)/.exec(doc?.centroide_ll ?? '');
  if (!doc || !m) return null;
  return { address: doc.weergavenaam, lat: Number(m[2]), lon: Number(m[1]) };
}
