import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { contains } from '../geo';
import { colors } from '../theme';
import type { Extras, Profile } from '../types';
import { T, column, inkMuted, periodLabel } from '../ui';

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
  const max = Math.max(1, ...totaal.map((n) => n ?? 0));

  return (
    <View style={[column, styles.card]}>
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
          <View style={styles.bars} accessibilityLabel={`Misdrijven per maand, laatste ${totaal.length} maanden`}>
            {totaal.map((n, i) => (
              <View
                key={v.perioden[i]}
                style={[styles.bar, { height: 4 + ((n ?? 0) / max) * 36, backgroundColor: i === totaal.length - 1 ? colors.ink : colors.sage }]}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {v.soorten
              .filter((s) => s !== 'totaal')
              .map((s) => {
                const series = buurt.reeksen[s] ?? [];
                const sum12 = series.slice(-12).reduce<number>((a, b) => a + (b ?? 0), 0);
                return (
                  <View key={s} style={styles.pill}>
                    <T style={{ fontSize: 12, color: colors.ink }}>
                      {LABELS[s] ?? s}: {sum12} in 12 mnd
                    </T>
                  </View>
                );
              })}
          </View>
          <T style={{ fontSize: 11, color: inkMuted }}>{v.bron}</T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 10 },
  divider: { height: 1, backgroundColor: colors.border },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: 14, textDecorationLine: 'underline' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40 },
  bar: { flex: 1, borderRadius: 2 },
  pill: { backgroundColor: colors.ivory, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
});
