import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import type { Cijfers, Omgeving, Profile } from '../types';
import { Compare, FadeIn, GrowBars, SplitBar, Tile, Trend, tint } from '../viz';
import { LuchtCard, ZwemwaterCard } from './OmgevingCards';
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

function Card({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <FadeIn index={index} style={[column, styles.card]}>
      <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
        {title}
      </T>
      {children}
    </FadeIn>
  );
}

const KOOP = colors.ink;
const CORPORATIE = colors.media;
const HUUR_OVERIG = colors.sage;

function Wonen({ c, buurtcode, index }: { c: Cijfers; buurtcode?: string; index: number }) {
  const w = c.wonen;
  const own = buurtcode ? w.buurten[buurtcode] : undefined;
  // Kleine buurten en bedrijventerreinen hebben geen WOZ-cijfers; toon dan de gemeente.
  const buurt = own && last(own.woz) ? own : undefined;
  const area = buurt ?? w.gemeente;
  const woz = last(area.woz);
  const woz0 = first(area.woz);
  const wozGm = last(w.gemeente.woz);
  const prijs = last(w.verkoopprijs.waarden);
  const prijsPrev = prijs && prijs.i > 0 ? w.verkoopprijs.waarden[prijs.i - 1] : null;
  const index_ = last(w.prijsindex.index);
  // Zelfde kwartaal een jaar eerder.
  const indexYear = index_ && index_.i >= 4 ? w.prijsindex.index?.[index_.i - 4] : null;
  const koop = last(area.koop)?.value;
  const huur = last(area.huur)?.value;
  const corp = last(area.corporatie)?.value;

  return (
    <Card title={`Wonen${buurt ? ` · ${buurt.naam}` : ''}`} index={index}>
      {woz && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1 }}>
              <T style={{ fontSize: 12, color: colors.textMuted }}>Gemiddelde WOZ-waarde {buurt ? 'in je buurt' : 'in de gemeente'}</T>
              <T weight="extrabold" style={{ fontSize: 28, lineHeight: 34, color: colors.ink }}>
                {thousands(woz.value)}
              </T>
            </View>
            {woz0 && woz0.i < woz.i && <Trend now={woz.value} before={woz0.value} upIsGood suffix={`sinds ${w.jaren[woz0.i]}`} />}
          </View>
          <GrowBars series={area.woz} label={`WOZ-waarde per jaar, ${w.jaren.join(' tot ')}`} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={styles.axis}>{w.jaren[0]}</T>
            <T style={styles.axis}>{w.jaren[w.jaren.length - 1]}</T>
          </View>
          {buurt && wozGm && (
            <Compare
              rows={[
                { label: buurt.naam, value: woz.value, color: colors.ink },
                { label: 'Gemeente', value: wozGm.value, color: colors.sage },
              ]}
              format={thousands}
            />
          )}
        </View>
      )}
      {koop != null && huur != null && (
        <>
          <View style={styles.divider} />
          <T weight="semibold" style={styles.sub}>
            Woningen{last(area.woningen) ? `: ${count(last(area.woningen)!.value)}` : ''}
          </T>
          <SplitBar
            parts={[
              { label: 'Koop', value: koop, color: KOOP },
              ...(corp != null
                ? [
                    { label: 'Huur corporatie', value: corp, color: CORPORATIE },
                    { label: 'Overige huur', value: Math.max(0, huur - corp), color: HUUR_OVERIG },
                  ]
                : [{ label: 'Huur', value: huur, color: HUUR_OVERIG }]),
            ]}
          />
        </>
      )}
      {(prijs || index_) && <View style={styles.divider} />}
      <View style={styles.grid}>
        {prijs && (
          <Tile
            label="Verkoopprijs gemeente"
            value={euro(prijs.value)}
            accent={colors.ink}
            trend={prijsPrev != null ? <Trend now={prijs.value} before={prijsPrev} upIsGood suffix="op jaar" /> : undefined}
            note={periodLabel(w.verkoopprijs.perioden[prijs.i])}
          />
        )}
        {index_ && (
          <Tile
            label={`Huizenprijzen ${w.prijsindex.regio}`}
            value={indexYear != null ? change(index_.value, indexYear) : `index ${index_.value.toFixed(1).replace('.', ',')}`}
            accent={colors.media}
            note={`${periodLabel(w.prijsindex.perioden[index_.i])}${indexYear != null ? ' t.o.v. een jaar eerder' : ''}`}
          />
        )}
      </View>
    </Card>
  );
}

function Economie({ c, buurtcode, index }: { c: Cijfers; buurtcode?: string; index: number }) {
  const e = c.economie;
  const u = e.uitkeringen;
  const ww = last(u.ww);
  const wwYear = ww && ww.i >= 12 ? u.ww?.[ww.i - 12] : null;
  const bijstand = last(u.bijstand);
  const bijstandYear = bijstand && bijstand.i >= 12 ? u.bijstand?.[bijstand.i - 12] : null;
  const ao = last(u.ao);
  const vest = last(e.vestigingen.waarden);
  const vest0 = first(e.vestigingen.waarden);
  const buurt = buurtcode ? e.buurten[buurtcode] : undefined;
  const gm = e.gemeente;
  // Meer WW-uitkeringen dan een jaar eerder kleurt oranje, minder groen.
  const wwUp = ww && wwYear != null ? ww.value > wwYear : null;

  return (
    <Card title="Economie" index={index}>
      {ww && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1 }}>
              <T style={{ fontSize: 12, color: colors.textMuted }}>WW-uitkeringen in de gemeente, {periodLabel(u.perioden[ww.i])}</T>
              <T weight="extrabold" style={{ fontSize: 28, lineHeight: 34, color: colors.ink }}>
                {count(ww.value)}
              </T>
            </View>
            {wwYear != null && <Trend now={ww.value} before={wwYear} upIsGood={false} suffix="op jaar" />}
          </View>
          <GrowBars series={u.ww} label="WW-uitkeringen per maand" accent={wwUp == null ? undefined : wwUp ? tint.let.solid : tint.goed.solid} />
        </View>
      )}
      <View style={styles.grid}>
        {bijstand && (
          <Tile
            label="Bijstand"
            value={count(bijstand.value)}
            accent={colors.media}
            trend={bijstandYear != null ? <Trend now={bijstand.value} before={bijstandYear} upIsGood={false} suffix="op jaar" /> : undefined}
            note={periodLabel(u.perioden[bijstand.i])}
          />
        )}
        {ao && <Tile label="Arbeidsongeschikt" value={count(ao.value)} accent={colors.media} note={periodLabel(u.perioden[ao.i])} />}
        {vest && (
          <Tile
            label="Bedrijfsvestigingen"
            value={count(vest.value)}
            accent={colors.ink}
            trend={vest0 && vest0.i < vest.i ? <Trend now={vest.value} before={vest0.value} upIsGood suffix={`sinds ${periodLabel(e.vestigingen.perioden[vest0.i])}`} /> : undefined}
            note={periodLabel(e.vestigingen.perioden[vest.i])}
          />
        )}
      </View>
      {(buurt?.inkomen || gm.inkomen) && (
        <>
          <View style={styles.divider} />
          <T weight="semibold" style={styles.sub}>
            Inkomen per inwoner ({(buurt?.inkomen ?? gm.inkomen)!.jaar})
          </T>
          <Compare
            rows={[
              ...(buurt?.inkomen ? [{ label: 'Je buurt', value: buurt.inkomen.waarde, color: colors.ink }] : []),
              ...(gm.inkomen ? [{ label: 'Gemeente', value: gm.inkomen.waarde, color: colors.sage }] : []),
            ]}
            format={thousands}
          />
        </>
      )}
      {(buurt?.participatie ?? gm.participatie) && (
        <>
          <T weight="semibold" style={styles.sub}>
            Werkend, netto arbeidsparticipatie ({(buurt?.participatie ?? gm.participatie)!.jaar})
          </T>
          <Compare
            rows={[
              ...(buurt?.participatie ? [{ label: 'Je buurt', value: buurt.participatie.waarde, color: colors.ink }] : []),
              ...(gm.participatie ? [{ label: 'Gemeente', value: gm.participatie.waarde, color: colors.sage }] : []),
            ]}
            format={(n) => pct(n)}
          />
        </>
      )}
      <T style={{ fontSize: 12, color: colors.textMuted }}>
        Het CBS publiceert geen werkloosheidspercentage per gemeente; het aantal WW-uitkeringen is het lokale signaal.
      </T>
    </Card>
  );
}

/** Lucht en zwemwater, en wonen en economie voor je buurt en gemeente, uit open data. */
export function CijfersScreen({ cijfers, omgeving, profile }: { cijfers: Cijfers | null; omgeving: Omgeving | null; profile: Profile }) {
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
      <LuchtCard omgeving={omgeving} profile={profile} />
      <ZwemwaterCard omgeving={omgeving} profile={profile} />
      {cijfers ? (
        <>
          <Wonen c={cijfers} buurtcode={profile.buurtcode} index={2} />
          <Economie c={cijfers} buurtcode={profile.buurtcode} index={3} />
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
  sub: { fontSize: 13, color: colors.ink },
  axis: { fontSize: 11, color: inkMuted },
});
