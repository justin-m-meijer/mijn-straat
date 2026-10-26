import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDistance } from '../geo';
import { colors } from '../theme';
import type { NearbyItem, Profile } from '../types';
import { Button, CategoryBadge, T, formatDate } from '../ui';

export function DetailScreen({ item, profile, onBack }: { item: NearbyItem; profile: Profile; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const hasPoint = item.lat != null && item.lon != null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {hasPoint ? (
          <MapView
            style={{ height: 240 }}
            initialRegion={{
              latitude: (item.lat! + profile.lat) / 2,
              longitude: (item.lon! + profile.lon) / 2,
              latitudeDelta: Math.max(Math.abs(item.lat! - profile.lat) * 2.6, 0.006),
              longitudeDelta: Math.max(Math.abs(item.lon! - profile.lon) * 2.6, 0.006),
            }}
          >
            <Marker coordinate={{ latitude: profile.lat, longitude: profile.lon }} title="Jij" pinColor={colors.ink} />
            <Marker coordinate={{ latitude: item.lat!, longitude: item.lon! }} title={item.address || item.title} pinColor="#B07A2A" />
          </MapView>
        ) : (
          <View style={{ height: insets.top + 56, backgroundColor: colors.ink }} />
        )}

        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 6 }}>
            <CategoryBadge category={item.category} />
            <T weight="extrabold" style={{ fontSize: 22, lineHeight: 27 }}>
              {item.title}
            </T>
            <T style={{ fontSize: 13, color: colors.textMuted }}>
              {[item.address, item.distance != null ? formatDistance(item.distance) : null, `${item.doc_type} · ${formatDate(item.published)}`]
                .filter(Boolean)
                .join(' · ')}
            </T>
          </View>

          {!!item.summary && (
            <View style={styles.card}>
              <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
                In gewone taal
              </T>
              <T style={{ fontSize: 15, lineHeight: 22, color: '#374151' }}>{item.summary}</T>
              <T style={{ fontSize: 12, color: colors.textMuted }}>Automatisch samengevat uit de officiële bekendmaking. De bekendmaking zelf is leidend.</T>
            </View>
          )}

          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(item.url)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T weight="semibold" style={{ color: colors.ink, fontSize: 15, textDecorationLine: 'underline' }}>
              Lees de officiële bekendmaking
            </T>
          </Pressable>
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Terug"
        onPress={onBack}
        style={[styles.back, { top: insets.top + 8 }]}
      >
        <T weight="extrabold" style={{ fontSize: 20, color: colors.text }}>
          ‹
        </T>
      </Pressable>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Lees en reageer" onPress={() => Linking.openURL(item.url)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 8 },
  back: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: 12, flexDirection: 'row' },
});
