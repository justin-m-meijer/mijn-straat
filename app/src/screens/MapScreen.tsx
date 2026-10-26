import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WHOLE_GEMEENTE, nearby } from '../geo';
import { categories, colors } from '../theme';
import type { Feed, NearbyItem, Profile } from '../types';
import { FLOATING_TAB_SPACE, useSideStrip } from '../ui';

export function MapScreen({ feed, profile, onOpen }: { feed: Feed; profile: Profile; onOpen: (item: NearbyItem) => void }) {
  const items = useMemo(() => nearby(feed, profile).filter((i) => i.distance != null), [feed, profile]);
  const insets = useSafeAreaInsets();
  const strip = useSideStrip();
  const map = useRef<MapView>(null);
  const region = regionFor(profile);

  // Bij een andere straal meezoomen zodat de cirkel (of de hele gemeente) in beeld past.
  useEffect(() => {
    map.current?.animateToRegion(regionFor(profile), 400);
  }, [profile.radius, profile.lat, profile.lon]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={region}
        // houd rekening met de zwevende glazen zijrail of tabbalk bij het centreren
        mapPadding={{ top: insets.top, right: strip, bottom: strip ? 0 : insets.bottom + FLOATING_TAB_SPACE, left: 0 }}
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

function regionFor(profile: Profile): Region {
  // ongeveer 111 km per breedtegraad; hele gemeente ≈ 16 km in beeld, anders de cirkel met wat marge
  const span = profile.radius === WHOLE_GEMEENTE ? 16_000 : profile.radius * 2.4;
  const latitudeDelta = span / 111_000;
  return {
    latitude: profile.lat,
    longitude: profile.lon,
    latitudeDelta,
    longitudeDelta: latitudeDelta / Math.cos((profile.lat * Math.PI) / 180),
  };
}
