import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadLiveLucht } from '../data';
import { distanceMeters, formatDistance } from '../geo';
import { ADVIES, LKI_KLEUR, klasse, lkiVoorStof } from '../lki';
import { colors } from '../theme';
import type { Meetstation, Meting, Omgeving, Profile, Zwemplek } from '../types';
import { T, column, inkMuted } from '../ui';
import { FadeIn, tint } from '../viz';

const STOFFEN: { key: string; label: string }[] = [
  { key: 'NO2', label: 'Stikstofdioxide' },
  { key: 'PM10', label: 'Fijnstof PM10' },
  { key: 'PM25', label: 'Fijnstof PM2,5' },
  { key: 'O3', label: 'Ozon' },
];

function hour(iso: string): string {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return today ? `vandaag ${time}` : `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${time}`;
}

function value(n: number): string {
  return `${(Math.round(n * 10) / 10).toString().replace('.', ',')}`;
}

function Card({ title, index, children }: { title: string; index: number; children: React.ReactNode }) {
  return (
    <FadeIn index={index} style={[column, styles.card]}>
      <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
        {title}
      </T>
      {children}
    </FadeIn>
  );
}

function withDistance<X extends { lat: number; lon: number }>(list: X[], profile: Profile): (X & { d: number })[] {
  return list.map((x) => ({ ...x, d: distanceMeters(profile.lat, profile.lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d);
}

// Labels onder de schaal, met het aantal stappen dat ze beslaan (1-3, 4-6, 7-8, 9-10, 11).
const SCHAAL_LABELS: [string, number][] = [['goed', 3], ['matig', 3], ['onvoldoende', 2], ['slecht', 2], ['', 1]];

/** De elf stappen van de index als gekleurde balk, met de huidige stap gemarkeerd. */
function Schaal({ n, height = 8 }: { n: number; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {LKI_KLEUR.slice(1).map((kleur, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: i + 1 === n ? height + 6 : height,
            marginTop: i + 1 === n ? 0 : 3,
            borderRadius: 3,
            backgroundColor: kleur,
            opacity: i + 1 <= n ? 1 : 0.35,
            borderWidth: i + 1 === n ? 2 : 0,
            borderColor: colors.ink,
          }}
        />
      ))}
    </View>
  );
}

function StofTegel({ stof, label, m }: { stof: string; label: string; m: Meting }) {
  const n = lkiVoorStof(stof, m.waarde);
  const k = n ? klasse(n) : null;
  return (
    <View
      style={[styles.tegel, k && { backgroundColor: k.bg, borderLeftColor: LKI_KLEUR[n!] }]}
      accessibilityLabel={`${label}: ${value(m.waarde)} microgram per kubieke meter${k ? `, ${k.label}` : ''}`}
    >
      <T style={{ fontSize: 12, color: k?.fg ?? colors.textMuted }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <T weight="bold" style={{ fontSize: 18, color: colors.ink }}>
          {value(m.waarde)} <T style={{ fontSize: 11, color: inkMuted }}>µg/m³</T>
        </T>
        {k && (
          <T weight="bold" style={{ fontSize: 13, color: k.fg }}>
            {k.label}
          </T>
        )}
      </View>
      {n != null && <Schaal n={n} height={4} />}
    </View>
  );
}

function Station({ s, d, live }: { s: Meetstation; d: number; live: Record<string, Meting> | null | undefined }) {
  const laatste = live ?? s.laatste ?? {};
  const lki = laatste.LKI;
  const k = lki ? klasse(lki.waarde) : null;
  const stoffen = STOFFEN.filter((x) => laatste[x.key]);
  const tijd = lki?.tijd ?? stoffen.map((x) => laatste[x.key].tijd).sort().pop();
  return (
    <View style={{ gap: 10 }}>
      <View>
        <T weight="semibold" style={{ fontSize: 15, color: colors.text }}>
          {s.naam}
        </T>
        <T style={{ fontSize: 12, color: colors.textMuted }}>
          {formatDistance(d)} van je adres{tijd ? ` · ${hour(tijd)}` : ''}
          {live === null ? ' · niet actueel' : ''}
        </T>
      </View>
      {lki && k && (
        <View
          style={[styles.band, { backgroundColor: k.bg }]}
          accessibilityLabel={`Luchtkwaliteit ${k.label}, index ${lki.waarde} van 11. ${ADVIES[k.label]}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.bol, { backgroundColor: LKI_KLEUR[lki.waarde] }]}>
              <T weight="extrabold" style={{ fontSize: 20, color: lki.waarde >= 7 ? colors.white : colors.ink }}>
                {lki.waarde}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 24, lineHeight: 28, color: k.fg }}>
                {k.label}
              </T>
              <T style={{ fontSize: 13, color: k.fg }}>{ADVIES[k.label]}</T>
            </View>
          </View>
          <Schaal n={lki.waarde} />
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {SCHAAL_LABELS.map(([label, flex]) => (
              <T key={label} numberOfLines={1} adjustsFontSizeToFit style={[styles.schaalLabel, { flex }]}>
                {label}
              </T>
            ))}
          </View>
        </View>
      )}
      {stoffen.length > 0 ? (
        <View style={styles.grid}>
          {stoffen.map((x) => (
            <StofTegel key={x.key} stof={x.key} label={x.label} m={laatste[x.key]} />
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
    <Card title="Luchtkwaliteit" index={0}>
      {stations.map((s, i) => (
        <View key={s.nummer} style={{ gap: 12 }}>
          {i > 0 && <View style={[styles.divider, { marginVertical: 4 }]} />}
          <Station s={s} d={s.d} live={live[s.nummer]} />
        </View>
      ))}
      <T style={{ fontSize: 12, color: colors.textMuted }}>
        Index van het RIVM: 1 tot 3 goed, 4 tot 6 matig, 7 en 8 onvoldoende, 9 en 10 slecht, 11 zeer slecht. Per stof de
        gemeten uurwaarde, nog niet gevalideerd. Bron: www.luchtmeetnet.nl
      </T>
    </Card>
  );
}

const WARN = new Set(['waarschuwing', 'negatief_zwemadvies', 'zwemverbod', 'nader_onderzoek']);

function inSeizoen(d = new Date()): boolean {
  const m = d.getMonth() + 1;
  return m >= 5 && m <= 9;
}

// EU-zwemwaterklassen van Rijkswaterstaat.
function euTint(oordeel: string) {
  const o = oordeel.toLowerCase();
  if (o === 'uitstekend' || o === 'goed') return tint.goed;
  if (o === 'aanvaardbaar') return tint.geel;
  if (o === 'slecht') return tint.slecht;
  return tint.neutraal;
}

function statusTint(status: string) {
  if (status === 'goed') return tint.goed;
  if (status === 'nader_onderzoek' || status === 'waarschuwing') return tint.geel;
  return tint.slecht; // negatief zwemadvies, zwemverbod
}

function Plek({ p }: { p: Zwemplek & { d: number } }) {
  const st = p.status ? statusTint(p.status) : null;
  const eu = p.eu_oordeel ? euTint(p.eu_oordeel) : null;
  return (
    <View style={[styles.plek, st && st !== tint.goed && { backgroundColor: st.bg }]}>
      <View style={[styles.dot, { backgroundColor: (st ?? eu ?? tint.neutraal).solid }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <T weight="semibold" style={{ fontSize: 15, color: colors.text, flexShrink: 1 }}>
            {p.naam}
          </T>
          <T style={{ fontSize: 12, color: colors.textMuted }}>{formatDistance(p.d)}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {p.status_label && st && (
            <View style={[styles.chip, { backgroundColor: st === tint.goed ? st.bg : colors.white }]}>
              <T weight="bold" style={{ fontSize: 12, color: st.fg }}>
                {p.status_label}
              </T>
            </View>
          )}
          {p.eu_oordeel && eu && (
            <View style={[styles.chip, { backgroundColor: colors.ivory }]}>
              <T style={{ fontSize: 12, color: eu.fg }}>
                Waterkwaliteit <T weight="bold" style={{ fontSize: 12, color: eu.fg }}>{p.eu_oordeel.toLowerCase()}</T>
              </T>
            </View>
          )}
        </View>
      </View>
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
    <Card title="Zwemwater" index={1}>
      {!inSeizoen() && (
        <T style={styles.body}>Buiten het zwemseizoen (1 mei tot en met 30 september) wordt het water niet gecontroleerd.</T>
      )}
      <View style={{ gap: 6 }}>
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
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  plek: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  band: { borderRadius: 14, padding: 14, gap: 10 },
  bol: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  schaalLabel: { fontSize: 11, color: inkMuted, textAlign: 'center' },
  tegel: {
    backgroundColor: colors.ivory,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: '47%',
    flexGrow: 1,
    gap: 4,
  },
  stat: { backgroundColor: colors.ivory, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: '47%', flexGrow: 1, gap: 2 },
});
