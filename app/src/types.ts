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

type Reeks = (number | null)[];
type Tijdreeks = { perioden: string[]; waarden: Reeks };
type Wonen = { woz: Reeks; woningen: Reeks; koop: Reeks; huur: Reeks; corporatie: Reeks };
type Laatste = { waarde: number; jaar: string } | null;
type BuurtEconomie = { inkomen: Laatste; participatie: Laatste; vestigingen: Laatste };

/** Wonen en economie uit CBS-data; reeksen per jaar volgen `wonen.jaren`. */
export type Cijfers = {
  bron: string;
  wonen: {
    jaren: string[];
    gemeente: Wonen;
    buurten: Record<string, Wonen & { naam: string }>;
    verkoopprijs: Tijdreeks; // gemeente, per jaar ('2025JJ00')
    prijsindex: { regio: string; perioden: string[]; index?: Reeks; prijs?: Reeks }; // provincie, per kwartaal
  };
  economie: {
    uitkeringen: { perioden: string[]; ww?: Reeks; bijstand?: Reeks; ao?: Reeks }; // gemeente, per maand
    vestigingen: Tijdreeks; // gemeente, per jaar
    gemeente: BuurtEconomie;
    buurten: Record<string, BuurtEconomie>;
  };
};

export type Extras = { wijkagenten: Wijkagent[]; veiligheid: Veiligheid | null; cijfers: Cijfers | null };

export type NearbyItem = FeedItem & { distance: number | null };
