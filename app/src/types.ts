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
  radius: number; // meters
  topics: Category[];
};

export type NearbyItem = FeedItem & { distance: number | null };
