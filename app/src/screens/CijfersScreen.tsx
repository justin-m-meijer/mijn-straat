import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import type { Cijfers, Profile } from '../types';
import { FLOATING_TAB_SPACE, T, column, inkMuted, periodLabel, useSidePadding, useSideStrip } from '../ui';

type Reeks = (number | null)[] | undefined;

// CBS levert bedragen in duizenden euro's (WOZ, inkomen) of in hele euro's (verkoopprijzen).
function euro(n: number): string {
  return `€ ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function thousands(n: number): string {
  return euro(n * 1000);
}

function count(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits).replace('.', ',')}%`;
}

function change(now: number, before: number): string {
  const d = ((now - before) / before) * 100;
  return `${d >= 0 ? '+' : '−'}${pct(Math.abs(d), 1)}`;
}

/** Laatste waarde met index, of null. */
function last(series: Reeks): { value: number; i: number } | null {
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null) return { value: v, i };
  }
  return null;
}

function first(series: Reeks): { value: number; i: number } | null {
  const i = series?.findIndex((v) => v != null) ?? -1;
  return i >= 0 ? { value: series![i]!, i } : null;
}

function Bars({ series, label }: { series: Reeks; label: string }) {
  const values = series ?? [];
  if (values.filter((v) => v != null).length < 2) return null;
  const max = Math.max(1, ...values.map((n) => n ?? 0));
  const min = Math.min(...values.filter((n): n is number => n != null));
  // Basis net onder het minimum, zodat kleine verschillen zichtbaar zijn.
  const floor = min * 0.8;
  return (
    <View style={styles.bars} accessibilityLabel={label}>
      {values.map((n, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: n == null ? 2 : 4 + ((n - floor) / (max - floor || 1)) * 36, backgroundColor: i === values.length - 1 ? colors.ink : colors.sage },
          ]}
        />
      ))}
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.stat}>
      <T style={{ fontSize: 12, color: colors.textMuted }}>{label}</T>
      <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
        {value}
      </T>
      {!!note && <T style={{ fontSize: 11, color: inkMuted }}>{note}</T>}
    </View>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={[column, styles.card]}>
      <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
        {title}
      </T>
      {children}
    </View>
  );
}

function Wonen({ c, buurtcode }: { c: Cijfers; buurtcode?: string }) {
  const w = c.wonen;
  const buurt = buurtcode ? w.buurten[buurtcode] : undefined;
  const area = buurt ?? w.gemeente;
  const woz = last(area.woz);
  const woz0 = first(area.woz);
  const wozGm = last(w.gemeente.woz);
  const prijs = last(w.verkoopprijs.waarden);
  const index = last(w.prijsindex.index);
  // Zelfde kwartaal een jaar eerder.
  const indexYear = index && index.i >= 4 ? w.prijsindex.index?.[index.i - 4] : null;

  return (
    <Card title={`Wonen${buurt ? ` · ${buurt.naam}` : ''}`}>
      {woz && (
        <View style={{ gap: 8 }}>
          <T style={styles.body}>
            De gemiddelde WOZ-waarde {buurt ? 'in je buurt' : 'in de gemeente'} is {thousands(woz.value)} ({w.jaren[woz.i]})
            {woz0 && woz0.i < woz.i ? `, ${change(woz.value, woz0.value)} sinds ${w.jaren[woz0.i]}` : ''}
            {buurt && wozGm ? `. Gemeente: ${thousands(wozGm.value)}.` : '.'}
          </T>
          <Bars series={area.woz} label={`WOZ-waarde per jaar, ${w.jaren.join(' tot ')}`} />
        </View>
      )}
      <View style={styles.grid}>
        {last(area.koop) && <Stat label="Koopwoningen" value={pct(last(area.koop)!.value)} />}
        {last(area.huur) && <Stat label="Huurwoningen" value={pct(last(area.huur)!.value)} />}
        {last(area.corporatie) && <Stat label="Van corporatie" value={pct(last(area.corporatie)!.value)} />}
        {last(area.woningen) && <Stat label="Woningen" value={count(last(area.woningen)!.value)} />}
      </View>
      {(prijs || index) && <View style={styles.divider} />}
      <View style={styles.grid}>
        {prijs && (
          <Stat
            label="Verkoopprijs gemeente"
            value={euro(prijs.value)}
            note={`${periodLabel(w.verkoopprijs.perioden[prijs.i])}${
              prijs.i > 0 && w.verkoopprijs.waarden[prijs.i - 1] != null ? `, ${change(prijs.value, w.verkoopprijs.waarden[prijs.i - 1]!)} op jaar` : ''
            }`}
          />
        )}
        {index && (
          <Stat
            label={`Huizenprijzen ${w.prijsindex.regio}`}
            value={indexYear != null ? change(index.value, indexYear) : `index ${index.value.toFixed(1).replace('.', ',')}`}
            note={`${periodLabel(w.prijsindex.perioden[index.i])}${indexYear != null ? ' t.o.v. een jaar eerder' : ''}`}
          />
        )}
      </View>
    </Card>
  );
}

function Economie({ c, buurtcode }: { c: Cijfers; buurtcode?: string }) {
  const e = c.economie;
  const u = e.uitkeringen;
  const ww = last(u.ww);
  const wwYear = ww && ww.i >= 12 ? u.ww?.[ww.i - 12] : null;
  const bijstand = last(u.bijstand);
  const ao = last(u.ao);
  const vest = last(e.vestigingen.waarden);
  const vest0 = first(e.vestigingen.waarden);
  const buurt = buurtcode ? e.buurten[buurtcode] : undefined;
  const gm = e.gemeente;

  return (
    <Card title="Economie">
      {ww && (
        <View style={{ gap: 8 }}>
          <T style={styles.body}>
            In {periodLabel(u.perioden[ww.i])} hadden {count(ww.value)} inwoners van de gemeente een WW-uitkering
            {wwYear != null ? ` (${change(ww.value, wwYear)} op jaar)` : ''}.
          </T>
          <Bars series={u.ww} label="WW-uitkeringen per maand" />
        </View>
      )}
      <View style={styles.grid}>
        {bijstand && <Stat label="Bijstand" value={count(bijstand.value)} note={periodLabel(u.perioden[bijstand.i])} />}
        {ao && <Stat label="Arbeidsongeschikt" value={count(ao.value)} note={periodLabel(u.perioden[ao.i])} />}
        {vest && (
          <Stat
            label="Bedrijfsvestigingen"
            value={count(vest.value)}
            note={
              vest0 && vest0.i < vest.i
                ? `${change(vest.value, vest0.value)} sinds ${periodLabel(e.vestigingen.perioden[vest0.i])}`
                : periodLabel(e.vestigingen.perioden[vest.i])
            }
          />
        )}
      </View>
      {(buurt?.inkomen || buurt?.participatie || gm.inkomen) && <View style={styles.divider} />}
      <View style={styles.grid}>
        {(buurt?.inkomen ?? gm.inkomen) && (
          <Stat
            label={buurt?.inkomen ? 'Inkomen per inwoner, buurt' : 'Inkomen per inwoner'}
            value={thousands((buurt?.inkomen ?? gm.inkomen)!.waarde)}
            note={`${(buurt?.inkomen ?? gm.inkomen)!.jaar}${buurt?.inkomen && gm.inkomen ? `; gemeente ${thousands(gm.inkomen.waarde)}` : ''}`}
          />
        )}
        {(buurt?.participatie ?? gm.participatie) && (
          <Stat
            label="Werkend (netto participatie)"
            value={pct((buurt?.participatie ?? gm.participatie)!.waarde)}
            note={`${(buurt?.participatie ?? gm.participatie)!.jaar}${buurt?.participatie && gm.participatie ? `; gemeente ${pct(gm.participatie.waarde)}` : ''}`}
          />
        )}
      </View>
      <T style={{ fontSize: 12, color: colors.textMuted }}>
        Het CBS publiceert geen werkloosheidspercentage per gemeente; het aantal WW-uitkeringen is het lokale signaal.
      </T>
    </Card>
  );
}

/** Wonen en economie voor je buurt en gemeente, uit open CBS-data. */
export function CijfersScreen({ cijfers, profile }: { cijfers: Cijfers | null; profile: Profile }) {
  const insets = useSafeAreaInsets();
  const strip = useSideStrip();
  const base = useSidePadding();
  const side = { paddingLeft: base.paddingLeft, paddingRight: strip || base.paddingRight };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ivory }}
      contentContainerStyle={[side, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + (strip ? 24 : FLOATING_TAB_SPACE), gap: 16 }]}
    >
      <View style={[column, { gap: 4 }]}>
        <T weight="extrabold" style={{ color: colors.ink, fontSize: 32, lineHeight: 38 }}>
          Cijfers
        </T>
        <T style={{ color: colors.textMuted, fontSize: 15 }}>{profile.address}</T>
      </View>
      {cijfers ? (
        <>
          <Wonen c={cijfers} buurtcode={profile.buurtcode} />
          <Economie c={cijfers} buurtcode={profile.buurtcode} />
          <T style={[column, { fontSize: 11, color: inkMuted }]}>Bron: {cijfers.bron}</T>
        </>
      ) : (
        <T style={[column, { color: colors.textMuted, marginTop: 24 }]}>Nog geen cijfers. Ververs de feed op je Mac om ze op te halen.</T>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 12 },
  body: { fontSize: 14, lineHeight: 20, color: '#374151' },
  divider: { height: 1, backgroundColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { backgroundColor: colors.ivory, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: '47%', flexGrow: 1, gap: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40 },
  bar: { flex: 1, borderRadius: 2 },
});
