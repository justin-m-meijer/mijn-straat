import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { contains } from '../geo';
import { colors } from '../theme';
import type { Extras, Profile } from '../types';
import { T, column, inkMuted, periodLabel } from '../ui';
import { FadeIn, GrowBars, tint } from '../viz';

const LABELS: Record<string, string> = {
  totaal: 'Alle misdrijven',
  woninginbraak: 'Woninginbraak',
  fiets: 'Fietsdiefstal',
  auto: 'Diefstal uit auto',
  vernieling: 'Vernieling',
  mishandeling: 'Mishandeling',
};

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * "Jouw buurt": wijkagent en misdrijfcijfers voor het eigen adres.
 * Alles wordt op het toestel gematcht; het adres gaat niet naar onze server.
 */
export function BuurtCard({ extras, profile }: { extras: Extras; profile: Profile }) {
  const agent = useMemo(
    () => extras.wijkagenten.find((a) => contains(a.polygoon, profile.lat, profile.lon)) ?? null,
    [extras.wijkagenten, profile.lat, profile.lon],
  );
  const v = extras.veiligheid;
  const buurt = v && profile.buurtcode ? v.buurten[profile.buurtcode] : undefined;
  if (!agent && !buurt) return null;

  const totaal = buurt?.reeksen.totaal ?? [];
  const last = totaal.length ? totaal[totaal.length - 1] : null;
  const avg12 = average(totaal.slice(-13, -1));
  // Boven het gemiddelde kleurt de laatste maand oranje, eronder groen.
  const accent = last != null && avg12 != null ? (last > avg12 ? tint.let.solid : tint.goed.solid) : undefined;

  return (
    <FadeIn style={[column, styles.card]}>
      <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
        Jouw buurt{buurt ? ` · ${buurt.naam}` : ''}
      </T>

      {agent && (
        <View style={{ gap: 2 }}>
          <T weight="bold" style={{ fontSize: 15 }}>
            {agent.naam}
          </T>
          <T style={{ fontSize: 13, color: colors.textMuted }}>{agent.functie}</T>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${agent.telefoon.replace(/\D/g, '')}`)} style={styles.link}>
              <T weight="semibold" style={styles.linkText}>
                Bel {agent.telefoon}
              </T>
            </Pressable>
            {!!agent.url && (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(agent.url!)} style={styles.link}>
                <T weight="semibold" style={styles.linkText}>
                  Op politie.nl
                </T>
              </Pressable>
            )}
          </View>
          <T style={{ fontSize: 12, color: colors.textMuted }}>Bij spoed altijd 112.</T>
        </View>
      )}

      {buurt && v && last != null && (
        <View style={{ gap: 8 }}>
          <View style={styles.divider} />
          <T style={{ fontSize: 14, lineHeight: 20, color: '#374151' }}>
            In {periodLabel(v.perioden[v.perioden.length - 1])} {last === 1 ? 'is 1 misdrijf' : `zijn ${last} misdrijven`} geregistreerd in je buurt
            {avg12 != null ? `; het gemiddelde over de 12 maanden daarvoor is ${avg12.toFixed(1).replace('.', ',')}.` : '.'}
          </T>
          <GrowBars series={totaal} floorRatio={0} accent={accent} label={`Misdrijven per maand, laatste ${totaal.length} maanden`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {v.soorten
              .filter((s) => s !== 'totaal')
              .map((s) => {
                const series = buurt.reeksen[s] ?? [];
                const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
                const sum12 = sum(series.slice(-12));
                // Vergelijk met de 12 maanden daarvoor, als die er zijn.
                const prev = series.length >= 24 ? sum(series.slice(-24, -12)) : null;
                const t = prev == null || sum12 === prev ? tint.neutraal : sum12 > prev ? tint.let : tint.goed;
                return (
                  <View key={s} style={[styles.pill, { backgroundColor: t.bg }]}>
                    <T style={{ fontSize: 12, color: t.fg }}>
                      {LABELS[s] ?? s}: <T weight="bold" style={{ fontSize: 12, color: t.fg }}>{sum12}</T> in 12 mnd
                      {prev != null && sum12 !== prev ? (sum12 > prev ? ' ▲' : ' ▼') : ''}
                    </T>
                  </View>
                );
              })}
          </View>
          <T style={{ fontSize: 11, color: inkMuted }}>{v.bron}</T>
        </View>
      )}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 10 },
  divider: { height: 1, backgroundColor: colors.border },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: 14, textDecorationLine: 'underline' },
  pill: { backgroundColor: colors.ivory, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
});
