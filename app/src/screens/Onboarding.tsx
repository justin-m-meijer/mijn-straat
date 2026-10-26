import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADII, formatRadius, lookupAddress } from '../geo';
import { categories, colors, fonts, type Category } from '../theme';
import type { Profile } from '../types';
import { Button, T, column, useSidePadding } from '../ui';

const TOPICS: Category[] = ['vergunning', 'verkeer', 'evenement', 'raad', 'regels'];

export function Onboarding({ initial, onDone }: { initial: Profile | null; onDone: (p: Profile) => void }) {
  const insets = useSafeAreaInsets();
  const side = useSidePadding(24);
  const [postcode, setPostcode] = useState('');
  const [huisnummer, setHuisnummer] = useState('');
  const [found, setFound] = useState<{ address: string; lat: number; lon: number } | null>(
    initial ? { address: initial.address, lat: initial.lat, lon: initial.lon } : null,
  );
  const [radius, setRadius] = useState(initial?.radius ?? 1000);
  const [topics, setTopics] = useState<Category[]>(initial?.topics ?? TOPICS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    setBusy(true);
    setError('');
    try {
      const hit = await lookupAddress(postcode, huisnummer);
      if (hit) setFound(hit);
      else setError('Dit adres vinden we niet. Controleer postcode en huisnummer.');
    } catch {
      setError('Adres opzoeken lukt nu niet. Heb je internet?');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (c: Category) => setTopics((t) => (t.includes(c) ? t.filter((x) => x !== c) : [...t, c]));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.hero, side, { paddingTop: insets.top + 32 }]}>
        <View style={[column, { gap: 12 }]}>
          <T weight="extrabold" style={styles.heroTitle}>
            Wat gebeurt er in jouw straat?
          </T>
          <T style={styles.heroText}>Vergunningen, verkeersbesluiten, evenementen en besluiten van de gemeente. Op één plek, voor jouw adres.</T>
        </View>
      </View>

      <View style={[styles.body, column, side]}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <T weight="bold" style={styles.label} nativeID="postcode">
              Postcode
            </T>
            <TextInput
              accessibilityLabelledBy="postcode"
              value={postcode}
              onChangeText={setPostcode}
              placeholder="6851 AB"
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <T weight="bold" style={styles.label} nativeID="huisnummer">
              Huisnummer
            </T>
            <TextInput
              accessibilityLabelledBy="huisnummer"
              value={huisnummer}
              onChangeText={setHuisnummer}
              placeholder="12"
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
          </View>
        </View>
        <Button label="Zoek adres" variant="secondary" onPress={search} disabled={busy || !postcode || !huisnummer} />
        {busy && <ActivityIndicator color={colors.ink} />}
        {!!error && <T style={{ color: '#9B2C2C' }}>{error}</T>}
        {found && (
          <View style={styles.found}>
            <T style={{ fontSize: 14 }}>
              Gevonden: <T weight="bold">{found.address}</T>
            </T>
          </View>
        )}

        <T weight="bold" style={styles.label}>
          Hoe ver om je heen?
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RADII.map((r) => {
            const on = r === radius;
            return (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setRadius(r)}
                style={[styles.radius, on && { backgroundColor: colors.ink, borderColor: colors.ink }]}
              >
                <T weight="bold" style={{ color: on ? colors.white : colors.text, fontSize: 15 }}>
                  {formatRadius(r)}
                </T>
              </Pressable>
            );
          })}
        </View>

        <T weight="bold" style={styles.label}>
          Waar wil je berichten over?
        </T>
        {TOPICS.map((c) => (
          <View key={c} style={styles.topic}>
            <T style={{ fontSize: 16, flex: 1 }}>{categories[c].label}</T>
            <Switch
              accessibilityLabel={categories[c].label}
              value={topics.includes(c)}
              onValueChange={() => toggle(c)}
              trackColor={{ true: colors.ink, false: '#D1D5DB' }}
            />
          </View>
        ))}

        <T style={styles.privacy}>
          Je adres blijft op je telefoon. Welke berichten in de buurt zijn, rekent de app zelf uit. Alleen bij het opzoeken gaat je postcode naar
          de PDOK-adresservice van het Kadaster.
        </T>

        <Button
          label="Toon mijn straat"
          disabled={!found || topics.length === 0}
          onPress={() => found && onDone({ ...found, radius, topics })}
        />
        <T style={styles.byline}>Een app van Jumpstart Media</T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.ink, paddingBottom: 28 },
  heroTitle: { color: colors.white, fontSize: 28, lineHeight: 33 },
  heroText: { color: '#E5EEEE', fontSize: 15, lineHeight: 22 },
  body: { paddingVertical: 24, gap: 16 },
  label: { fontSize: 13, color: '#374151' },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  found: { backgroundColor: colors.ivory, borderRadius: 12, padding: 12 },
  radius: { flexGrow: 1, minWidth: 72, paddingHorizontal: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
  topic: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  privacy: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  byline: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
});
