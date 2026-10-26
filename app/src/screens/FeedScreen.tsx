import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDistance, nearby } from '../geo';
import { categories, colors, type Category } from '../theme';
import type { Feed, NearbyItem, Profile } from '../types';
import { CategoryDot, T, column, formatDate, useSidePadding } from '../ui';

type Filter = 'alles' | Category;

export function FeedScreen({
  feed,
  profile,
  refreshing,
  onRefresh,
  onOpen,
  onEditProfile,
}: {
  feed: Feed;
  profile: Profile;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: NearbyItem) => void;
  onEditProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  const side = useSidePadding();
  const [filter, setFilter] = useState<Filter>('alles');
  const all = useMemo(() => nearby(feed, profile), [feed, profile]);
  const items = filter === 'alles' ? all : all.filter((i) => i.category === filter);
  const filters: Filter[] = ['alles', ...profile.topics];

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <View style={[styles.header, side, { paddingTop: insets.top + 12 }]}>
        <View style={[column, { gap: 14 }]}>
        <Pressable accessibilityRole="button" accessibilityHint="Adres of straal wijzigen" onPress={onEditProfile} style={{ gap: 2 }}>
          <T weight="extrabold" style={{ color: colors.white, fontSize: 20 }}>
            Mijn Straat
          </T>
          <T style={{ color: '#E5EEEE', fontSize: 13 }}>
            {profile.address} · {formatDistance(profile.radius)}
          </T>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {filters.map((f) => {
            const on = f === filter;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f)}
                style={[styles.chip, on ? { backgroundColor: colors.sage, borderColor: colors.sage } : null]}
              >
                <T weight="semibold" style={{ color: on ? colors.ink : colors.white, fontSize: 13 }}>
                  {f === 'alles' ? 'Alles' : categories[f].label}
                </T>
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

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[column, side, { paddingTop: 16, gap: 12, paddingBottom: 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
        ListEmptyComponent={
          <T style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>Geen berichten binnen {formatDistance(profile.radius)}.</T>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
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
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.ink, paddingBottom: 16 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center' },
  sample: { backgroundColor: '#EFE8D6', paddingHorizontal: 16, paddingVertical: 8 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12 },
});
