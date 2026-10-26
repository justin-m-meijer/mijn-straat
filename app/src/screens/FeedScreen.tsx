import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADII, formatDistance, nearby } from '../geo';
import { categories, colors, type Category } from '../theme';
import type { Extras, Feed, NearbyItem, Profile } from '../types';
import { BuurtCard } from './BuurtCard';
import { CategoryDot, FLOATING_TAB_SPACE, Glass, RadiusControl, T, column, formatDate, useSidePadding, useSideStrip } from '../ui';

type Filter = 'alles' | Category;

// Hoogte van de zwevende glazen filterbalk bovenin.
const FILTER_BAR_HEIGHT = 52;

export function FeedScreen({
  feed,
  profile,
  refreshing,
  onRefresh,
  onOpen,
  onEditProfile,
  onRadiusChange,
  extras,
}: {
  feed: Feed;
  profile: Profile;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: NearbyItem) => void;
  onEditProfile: () => void;
  onRadiusChange: (radius: number) => void;
  extras: Extras;
}) {
  const insets = useSafeAreaInsets();
  const strip = useSideStrip(); // > 0: straal en navigatie staan in de glazen zijrail
  const base = useSidePadding();
  // Inhoud loopt van rand tot rand; in rustpositie houden we vrij wat onder de zijrail zou vallen.
  const side = { paddingLeft: base.paddingLeft, paddingRight: strip || base.paddingRight };
  const [filter, setFilter] = useState<Filter>('alles');
  const all = useMemo(() => nearby(feed, profile), [feed, profile]);
  const items = filter === 'alles' ? all : all.filter((i) => i.category === filter);
  const filters: Filter[] = ['alles', ...profile.topics];
  const barTop = insets.top + 8;

  // Grote titel in iOS-stijl: scrolt mee met de lijst, onder de glazen filterbalk door.
  const header = (
    <View style={[side, { paddingTop: barTop + FILTER_BAR_HEIGHT + 16, paddingBottom: 16 }]}>
      <View style={[column, { gap: 16 }]}>
        <Pressable accessibilityRole="button" accessibilityHint="Adres wijzigen" onPress={onEditProfile} style={{ gap: 4 }}>
          <T weight="extrabold" style={{ color: colors.ink, fontSize: 32, lineHeight: 38 }}>
            Mijn Straat
          </T>
          <T style={{ color: colors.textMuted, fontSize: 15 }}>{profile.address}</T>
        </Pressable>
        {/* naast de categorie 'Alles' zou een tweede 'Alles' verwarren; in de smalle zijrail past alleen 'Alles' */}
        {!strip && <RadiusControl radii={RADII} value={profile.radius} onChange={onRadiusChange} wholeLabel="Gemeente" />}
        {filter === 'alles' && <BuurtCard extras={extras} profile={profile} />}
        {feed.sample && (
          <View style={styles.sample}>
            <T style={{ fontSize: 12, color: '#6B5426' }}>Voorbeelddata. Zet EXPO_PUBLIC_FEED_URL om de echte feed van je Mac te laden.</T>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + (strip ? 24 : FLOATING_TAB_SPACE) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} progressViewOffset={barTop + FILTER_BAR_HEIGHT} />
        }
        ListEmptyComponent={
          <T style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>
            {profile.radius ? `Geen berichten binnen ${formatDistance(profile.radius)}.` : 'Geen berichten in de gemeente.'}
          </T>
        }
        renderItem={({ item }) => (
          <View style={[side, { marginBottom: 12 }]}>
            <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={({ pressed }) => [column, styles.card, pressed && { opacity: 0.85 }]}>
              <CategoryDot category={item.category} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T weight="bold" style={{ fontSize: 12, color: '#374151', flexShrink: 1 }} numberOfLines={1}>
                    {categories[item.category].label}
                    {item.distance != null ? ` · ${formatDistance(item.distance)}` : ' · hele gemeente'}
                  </T>
                  <T style={{ fontSize: 12, color: colors.textMuted, flexShrink: 0 }}>{formatDate(item.published)}</T>
                </View>
                <T weight="bold" style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={3}>
                  {item.title}
                </T>
                {!!item.summary && (
                  <T style={{ fontSize: 13, lineHeight: 18, color: colors.textMuted }} numberOfLines={2}>
                    {item.summary}
                  </T>
                )}
              </View>
            </Pressable>
          </View>
        )}
      />

      {/* Zwevende glazen filterbalk: de kaarten schuiven eronder door. */}
      <Glass style={[styles.bar, { top: barTop, left: base.paddingLeft - 8, right: (strip || base.paddingRight) - 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 6 }}>
          {filters.map((f) => {
            const on = f === filter;
            return (
              <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(f)}>
                <Glass interactive tint={on ? colors.ink : undefined} solid={on ? colors.ink : 'transparent'} style={styles.chip}>
                  <T weight="semibold" style={{ color: on ? colors.white : colors.ink, fontSize: 13 }}>
                    {f === 'alles' ? 'Alles' : categories[f].label}
                  </T>
                </Glass>
              </Pressable>
            );
          })}
        </ScrollView>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  // capsules: balk, chips en segmenten delen dezelfde ronde vorm
  bar: { position: 'absolute', height: FILTER_BAR_HEIGHT, borderRadius: FILTER_BAR_HEIGHT / 2, overflow: 'hidden' },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  sample: { backgroundColor: '#EFE8D6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12 },
});
