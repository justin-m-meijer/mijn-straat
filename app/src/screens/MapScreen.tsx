import { useMemo } from 'react';
import { View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { WHOLE_GEMEENTE, nearby } from '../geo';
import { categories, colors } from '../theme';
import type { Feed, NearbyItem, Profile } from '../types';

export function MapScreen({ feed, profile, onOpen }: { feed: Feed; profile: Profile; onOpen: (item: NearbyItem) => void }) {
  const items = useMemo(() => nearby(feed, profile).filter((i) => i.distance != null), [feed, profile]);
  // ongeveer 111 km per breedtegraad; hele gemeente ≈ 16 km in beeld
  const span = profile.radius === WHOLE_GEMEENTE ? 16_000 : profile.radius * 2.8;
  const delta = span / 111_000;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ latitude: profile.lat, longitude: profile.lon, latitudeDelta: delta, longitudeDelta: delta * 1.6 }}
        showsPointsOfInterests={false}
      >
        {profile.radius !== WHOLE_GEMEENTE && (
          <Circle
            center={{ latitude: profile.lat, longitude: profile.lon }}
            radius={profile.radius}
            strokeColor={colors.ink}
            strokeWidth={1.5}
            fillColor="rgba(31,78,99,0.07)"
          />
        )}
        <Marker coordinate={{ latitude: profile.lat, longitude: profile.lon }} title="Jouw adres" pinColor={colors.ink} />
        {items.map((i) => (
          <Marker
            key={i.id}
            coordinate={{ latitude: i.lat!, longitude: i.lon! }}
            title={i.title}
            description={categories[i.category].label}
            pinColor={categories[i.category].fg}
            onCalloutPress={() => onOpen(i)}
          />
        ))}
      </MapView>
    </View>
  );
}
