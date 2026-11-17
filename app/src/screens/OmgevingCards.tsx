import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadLiveLucht } from '../data';
import { distanceMeters, formatDistance } from '../geo';
import { colors } from '../theme';
import type { Meetstation, Meting, Omgeving, Profile, Zwemplek } from '../types';
import { T, column, inkMuted } from '../ui';

const STOFFEN: { key: string; label: string }[] = [
  { key: 'NO2', label: 'Stikstofdioxide' },
  { key: 'PM10', label: 'Fijnstof PM10' },
  { key: 'PM25', label: 'Fijnstof PM2,5' },
  { key: 'O3', label: 'Ozon' },
];

/** Luchtkwaliteitsindex van het RIVM (1 tot en met 11) met de officiële klassen. */
function lkiKlasse(n: number): { label: string; bg: string; fg: string } {
  if (n <= 3) return { label: 'Goed', bg: '#DCEBEA', fg: '#2D5E5B' };
  if (n <= 6) return { label: 'Matig', bg: '#F4ECCF', fg: '#6B5426' };
  if (n <= 8) return { label: 'Onvoldoende', bg: '#F3E3D3', fg: '#7A4A22' };
  if (n <= 10) return { label: 'Slecht', bg: '#F2D9D6', fg: '#8A2E24' };
  return { label: 'Zeer slecht', bg: '#E8DAEE', fg: '#5B2C6F' };
}

function hour(iso: string): string {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return today ? `vandaag ${time}` : `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${time}`;
}

function value(n: number): string {
  return `${(Math.round(n * 10) / 10).toString().replace('.', ',')}`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[column, styles.card]}>
      <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
        {title}
      </T>
      {children}
    </View>
  );
}

function withDistance<X extends { lat: number; lon: number }>(list: X[], profile: Profile): (X & { d: number })[] {
  return list.map((x) => ({ ...x, d: distanceMeters(profile.lat, profile.lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d);
}

function Station({ s, d, live }: { s: Meetstation; d: number; live: Record<string, Meting> | null | undefined }) {
  const laatste = live ?? s.laatste ?? {};
  const lki = laatste.LKI;
  const klasse = lki ? lkiKlasse(lki.waarde) : null;
  const stoffen = STOFFEN.filter((x) => laatste[x.key]);
  const tijd = lki?.tijd ?? stoffen.map((x) => laatste[x.key].tijd).sort().pop();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <T weight="semibold" style={{ fontSize: 15, color: colors.text }}>
            {s.naam}
          </T>
          <T style={{ fontSize: 12, color: colors.textMuted }}>
            {formatDistance(d)} van je adres{tijd ? ` · ${hour(tijd)}` : ''}
            {live ? '' : live === null ? ' · niet actueel' : ''}
          </T>
        </View>
        {klasse && (
          <View style={[styles.chip, { backgroundColor: klasse.bg }]} accessibilityLabel={`Luchtkwaliteitsindex ${lki!.waarde}, ${klasse.label}`}>
            <T weight="bold" style={{ fontSize: 13, color: klasse.fg }}>
              {klasse.label} · {lki!.waarde}
            </T>
          </View>
        )}
      </View>
      {stoffen.length > 0 ? (
        <View style={styles.grid}>
          {stoffen.map((x) => (
            <View key={x.key} style={styles.stat}>
              <T style={{ fontSize: 12, color: colors.textMuted }}>{x.label}</T>
              <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
                {value(laatste[x.key].waarde)} <T style={{ fontSize: 12, color: inkMuted }}>µg/m³</T>
              </T>
            </View>
          ))}
        </View>
      ) : (
        <T style={{ fontSize: 13, color: colors.textMuted }}>Geen recente metingen.</T>
      )}
    </View>
  );
}

/** Luchtkwaliteit bij de dichtstbijzijnde meetstations, met actuele uurwaarden van Luchtmeetnet. */
export function LuchtCard({ omgeving, profile }: { omgeving: Omgeving | null; profile: Profile }) {
  const stations = useMemo(() => withDistance(omgeving?.lucht?.stations ?? [], profile).slice(0, 2), [omgeving, profile]);
  // undefined = nog bezig, null = mislukt (dan de waarden uit de feed).
  const [live, setLive] = useState<Record<string, Record<string, Meting> | null>>({});
  const key = stations.map((s) => s.nummer).join(',');

  useEffect(() => {
    let cancelled = false;
    for (const s of stations) {
      loadLiveLucht(s.nummer).then((m) => {
        if (!cancelled) setLive((prev) => ({ ...prev, [s.nummer]: m }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!stations.length) return null;
  return (
    <Card title="Luchtkwaliteit">
      {stations.map((s, i) => (
        <View key={s.nummer} style={{ gap: 12 }}>
          {i > 0 && <View style={styles.divider} />}
          <Station s={s} d={s.d} live={live[s.nummer]} />
        </View>
      ))}
      <T style={{ fontSize: 12, color: colors.textMuted }}>
        De index loopt van 1 (goed) tot 11 (zeer slecht). Uurwaarden zijn nog niet gevalideerd. Bron: www.luchtmeetnet.nl
      </T>
    </Card>
  );
}

const WARN = new Set(['waarschuwing', 'negatief_zwemadvies', 'zwemverbod', 'nader_onderzoek']);

function inSeizoen(d = new Date()): boolean {
  const m = d.getMonth() + 1;
  return m >= 5 && m <= 9;
}

function Plek({ p }: { p: Zwemplek & { d: number } }) {
  const warn = p.status ? WARN.has(p.status) : false;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 15, color: colors.text }}>
          {p.naam}
        </T>
        <T style={{ fontSize: 12, color: colors.textMuted }}>
          {formatDistance(p.d)}
          {p.eu_oordeel ? ` · waterkwaliteit ${p.eu_oordeel.toLowerCase()}` : ''}
        </T>
      </View>
      {p.status_label && (
        <View style={[styles.chip, { backgroundColor: warn ? '#F2D9D6' : '#DCEBEA' }]}>
          <T weight="bold" style={{ fontSize: 13, color: warn ? '#8A2E24' : '#2D5E5B' }}>
            {p.status_label}
          </T>
        </View>
      )}
    </View>
  );
}

/** Officiële zwemplekken in de buurt; waarschuwingen eerst. */
export function ZwemwaterCard({ omgeving, profile }: { omgeving: Omgeving | null; profile: Profile }) {
  const plekken = useMemo(() => {
    const all = withDistance(omgeving?.zwemwater?.plekken ?? [], profile);
    const warn = all.filter((p) => p.status && WARN.has(p.status) && p.d <= 15000);
    const rest = all.filter((p) => !warn.includes(p)).slice(0, Math.max(0, 5 - warn.length));
    return [...warn, ...rest];
  }, [omgeving, profile]);

  if (!plekken.length) return null;
  const hasStatus = plekken.some((p) => p.status_label);
  return (
    <Card title="Zwemwater">
      {!inSeizoen() && (
        <T style={styles.body}>Buiten het zwemseizoen (1 mei tot en met 30 september) wordt het water niet gecontroleerd.</T>
      )}
      <View style={{ gap: 10 }}>
        {plekken.map((p) => (
          <Plek key={p.id || p.naam} p={p} />
        ))}
      </View>
      <T style={{ fontSize: 12, color: colors.textMuted }}>
        {hasStatus ? 'Actuele status: zwemwater.nl. ' : ''}
        Waterkwaliteit: EU-oordeel van Rijkswaterstaat over de afgelopen vier jaar.
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 12 },
  body: { fontSize: 14, lineHeight: 20, color: '#374151' },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { backgroundColor: colors.ivory, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: '47%', flexGrow: 1, gap: 2 },
});
