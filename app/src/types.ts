import type { Category } from './theme';

export type FeedItem = {
  id: string;
  source: string;
  title: string;
  published: string;
  url: string;
  doc_type: string;
  subjects: string[];
  category: Category;
  summary: string;
  location_hint: string;
  address: string;
  lat: number | null;
  lon: number | null;
};

export type Feed = {
  gemeente: string;
  generated_at: string;
  model: string | null;
  stats: { items: number; located: number };
  items: FeedItem[];
  sample?: boolean;
};

export type Profile = {
  address: string; // weergavenaam van PDOK
  lat: number;
  lon: number;
  radius: number; // meters, 0 = hele gemeente
  topics: Category[];
  buurtcode?: string; // CBS-buurtcode via PDOK, voor de misdrijfcijfers
  version?: number;
};

export type Wijkagent = {
  id: string;
  naam: string;
  functie: string;
  werkgebied: string;
  telefoon: string;
  facebook?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  url?: string | null;
  polygoon: GeoJSON;
};

// Alleen wat we nodig hebben om punt-in-polygoon te doen.
export type GeoJSON =
  | { type: 'FeatureCollection'; features: GeoJSON[] }
  | { type: 'Feature'; geometry: GeoJSON | null }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export type Veiligheid = {
  bron: string;
  perioden: string[]; // '2026MM09'
  soorten: string[];
  gemeente: Record<string, (number | null)[]>;
  buurten: Record<string, { naam: string; reeksen: Record<string, (number | null)[]> }>;
};

export type Extras = { wijkagenten: Wijkagent[]; veiligheid: Veiligheid | null };

export type NearbyItem = FeedItem & { distance: number | null };
