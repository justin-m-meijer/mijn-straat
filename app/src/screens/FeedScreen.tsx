import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADII, formatDistance, formatRadius, nearby } from '../geo';
import { categories, colors, type Category } from '../theme';
import type { Feed, NearbyItem, Profile } from '../types';
import { CategoryDot, FLOATING_TAB_SPACE, Glass, T, column, formatDate, useSidePadding, useSideStrip } from '../ui';

type Filter = 'alles' | Category;

export function FeedScreen({
  feed,
  profile,
  refreshing,
  onRefresh,
  onOpen,
  onEditProfile,
  onRadiusChange,
}: {
  feed: Feed;
  profile: Profile;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: NearbyItem) => void;
  onEditProfile: () => void;
  onRadiusChange: (radius: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const side = useSidePadding();
  const rail = useSideStrip() > 0; // adres en straal staan dan in de zijrail
  const [filter, setFilter] = useState<Filter>('alles');
  const all = useMemo(() => nearby(feed, profile), [feed, profile]);
  const items = filter === 'alles' ? all : all.filter((i) => i.category === filter);
  const filters: Filter[] = ['alles', ...profile.topics];

  // Kop scrolt mee met de lijst; alleen een ink-strook achter de statusbalk blijft staan.
  const header = (
    <View style={{ marginBottom: 16 }}>
      <View style={[styles.header, side, { paddingTop: insets.top + 12 }]}>
        <View style={styles.bounce} />
        <View style={[column, { gap: 14 }]}>
          <Pressable accessibilityRole="button" accessibilityHint="Adres of straal wijzigen" onPress={onEditProfile} style={{ gap: 2 }}>
            <T weight="extrabold" style={{ color: colors.white, fontSize: 20 }}>
              Mijn Straat
            </T>
            {!rail && (
              <T style={{ color: '#E5EEEE', fontSize: 13 }}>
                {profile.address}
              </T>
            )}
          </Pressable>
          {!rail && (
            <View style={styles.segments} accessibilityRole="radiogroup">
              {RADII.map((r) => {
                const on = r === profile.radius;
                return (
                  <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onRadiusChange(r)} style={{ flex: 1 }}>
                    <Glass interactive dark tint={on ? colors.sage : undefined} solid="transparent" style={styles.segment}>
                      <T weight={on ? 'bold' : 'semibold'} style={{ color: on ? colors.ink : colors.white, fontSize: 13 }} numberOfLines={1}>
                        {formatRadius(r)}
                      </T>
                    </Glass>
                  </Pressable>
                );
              })}
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            {filters.map((f) => {
              const on = f === filter;
              return (
                <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(f)}>
                  <Glass interactive dark tint={on ? colors.sage : undefined} solid="rgba(255,255,255,0.12)" style={styles.chip}>
                    <T weight="semibold" style={{ color: on ? colors.ink : colors.white, fontSize: 13 }}>
                      {f === 'alles' ? 'Alles' : categories[f].label}
                    </T>
                  </Glass>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {feed.sample && (
        <View style={styles.sample}>
          <T style={{ fontSize: 12, color: '#6B5426' }}>Voorbeelddata. Zet EXPO_PUBLIC_FEED_URL om de echte feed van je Mac te laden.</T>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: rail ? 24 : insets.bottom + FLOATING_TAB_SPACE }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.white} />}
        ListEmptyComponent={
          <T style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>{profile.radius ? `Geen berichten binnen ${formatDistance(profile.radius)}.` : 'Geen berichten in de gemeente.'}</T>
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
      <View style={[styles.statusStrip, { height: insets.top }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.ink, paddingBottom: 16 },
  // vult de overscroll boven de kop bij pull-to-refresh, zodat daar geen lichte strook verschijnt
  bounce: { position: 'absolute', left: 0, right: 0, top: -1000, height: 1000, backgroundColor: colors.ink },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.ink },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  segments: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 3, gap: 3 },
  segment: { minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  sample: { backgroundColor: '#EFE8D6', paddingHorizontal: 16, paddingVertical: 8 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12 },
});
