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
  /** Er is (nog) geen feed voor de gemeente van het adres. */
  unavailable?: boolean;
  /** Grote gemeenten verwerken we alleen rond één postcode. */
  focus?: { postcode: string; lat: number; lon: number; radius: number; buurt?: string; wijk?: string } | null;
};

export type Profile = {
  address: string; // weergavenaam van PDOK
  lat: number;
  lon: number;
  radius: number; // meters, 0 = hele gemeente
  topics: Category[];
  buurtcode?: string; // CBS-buurtcode via PDOK, voor de misdrijfcijfers
  gemeente?: string; // via PDOK; bepaalt welke feed de app ophaalt
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

export type Meting = { waarde: number; tijd: string };

/** Meetstation van Luchtmeetnet; `laatste` per stof ('NO2', 'PM10', 'PM25', 'O3') en 'LKI'. */
export type Meetstation = {
  nummer: string;
  naam: string;
  lat: number;
  lon: number;
  type: string;
  stoffen: string[];
  afstand?: number;
  laatste?: Record<string, Meting>;
};

export type Zwemplek = {
  id: string;
  naam: string;
  adres?: string;
  lat: number;
  lon: number;
  /** Actuele status van zwemwater.nl; ontbreekt in de online kopie. */
  status?: string;
  status_label?: string;
  eu_oordeel?: string | null;
};

/** Lucht en zwemwater rond de gemeente of het focusgebied. */
export type Omgeving = {
  generated_at?: string;
  lucht?: { bron: string; stations: Meetstation[] };
  zwemwater?: { bron: string; plekken: Zwemplek[] };
};

export type Extras = { wijkagenten: Wijkagent[]; veiligheid: Veiligheid | null; cijfers: Cijfers | null; omgeving: Omgeving | null };

export type NearbyItem = FeedItem & { distance: number | null };
