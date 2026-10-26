import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadFeed, loadProfile, saveProfile } from './src/data';
import { DetailScreen } from './src/screens/DetailScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { Onboarding } from './src/screens/Onboarding';
import { colors } from './src/theme';
import type { Feed, NearbyItem, Profile } from './src/types';
import { RADII } from './src/geo';
import { Glass, GlassGroup, RadiusControl, T, inkMuted, useSideStrip } from './src/ui';

type Tab = 'feed' | 'kaart';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [fontsLoaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('feed');
  const [open, setOpen] = useState<NearbyItem | null>(null);
  const strip = useSideStrip();

  useEffect(() => {
    loadProfile().then(setProfile);
    loadFeed().then(setFeed);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) {
        setOpen(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [open]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFeed(await loadFeed());
    setRefreshing(false);
  }, []);

  const changeRadius = async (radius: number) => {
    if (!profile) return;
    const p = { ...profile, radius };
    setProfile(p);
    await saveProfile(p);
  };

  if (!fontsLoaded || profile === undefined || !feed) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!profile || editing) {
    return (
      <>
        <StatusBar style="light" />
        <Onboarding
          initial={profile}
          onDone={async (p) => {
            await saveProfile(p);
            setProfile(p);
            setEditing(false);
          }}
        />
      </>
    );
  }

  if (open) {
    return (
      <>
        <StatusBar style="dark" />
        <DetailScreen item={open} profile={profile} onBack={() => setOpen(null)} />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'feed' ? (
          <FeedScreen
            feed={feed}
            profile={profile}
            refreshing={refreshing}
            onRefresh={refresh}
            onOpen={setOpen}
            onEditProfile={() => setEditing(true)}
            onRadiusChange={changeRadius}
          />
        ) : (
          <MapScreen feed={feed} profile={profile} onOpen={setOpen} />
        )}
      </View>
      {strip ? (
        <SideRail
          width={strip}
          tab={tab}
          profile={profile}
          onChange={setTab}
          onSettings={() => setEditing(true)}
          onRadiusChange={changeRadius}
        />
      ) : (
        <TabBar tab={tab} onChange={setTab} onSettings={() => setEditing(true)} />
      )}
    </View>
  );
}

// Ruimte bovenin de zijstrook voor de statusiconen van het toestel (tijd, wifi, account).
const STATUS_CLUSTER_HEIGHT = 170;

const TABS: { key: Tab | 'instellingen'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feed', label: 'Feed', icon: 'newspaper' },
  { key: 'kaart', label: 'Kaart', icon: 'map' },
  { key: 'instellingen', label: 'Adres', icon: 'location' },
];

/**
 * Zijstrook van brede/vouwbare toestellen: zwevende glazen panelen boven de inhoud (lijst of kaart).
 * Straal en navigatie zijn twee glazen vormen in één GlassGroup, zodat ze als één familie samensmelten.
 */
function SideRail({
  width,
  tab,
  profile,
  onChange,
  onSettings,
  onRadiusChange,
}: {
  width: number;
  tab: Tab;
  profile: Profile;
  onChange: (t: Tab) => void;
  onSettings: () => void;
  onRadiusChange: (radius: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <GlassGroup
      spacing={16}
      style={[styles.rail, { width: width - 16, top: insets.top + STATUS_CLUSTER_HEIGHT, bottom: insets.bottom + 8 }]}
    >
      <View style={{ gap: 8 }}>
        <T weight="semibold" style={styles.caption}>
          Straal
        </T>
        <RadiusControl vertical radii={RADII} value={profile.radius} onChange={onRadiusChange} />
      </View>
      <Glass style={styles.railNav}>
        <View style={{ gap: 8 }} accessibilityRole="tablist">
          {TABS.map((t) => (
            <NavItem key={t.key} item={t} on={t.key === tab} onPress={() => (t.key === 'instellingen' ? onSettings() : onChange(t.key))} />
          ))}
        </View>
      </Glass>
    </GlassGroup>
  );
}

function NavItem({ item, on, onPress }: { item: (typeof TABS)[number]; on: boolean; onPress: () => void }) {
  const color = on ? colors.ink : inkMuted;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={item.label} onPress={onPress} style={styles.navItem}>
      <Ionicons name={on ? item.icon : (`${item.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={24} color={color} />
      <T weight={on ? 'bold' : 'semibold'} style={{ fontSize: 11, color }}>
        {item.label}
      </T>
    </Pressable>
  );
}

/** Zwevende glazen tabbalk op gewone telefoons; de lijst en kaart lopen eronder door. */
function TabBar({ tab, onChange, onSettings }: { tab: Tab; onChange: (t: Tab) => void; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Glass style={[styles.tabbar, { bottom: (insets.bottom || 12) + 4, left: 24 + insets.left, right: 24 + insets.right }]}>
      <View style={{ flexDirection: 'row', flex: 1 }} accessibilityRole="tablist">
        {TABS.map((t) => (
          <NavItem key={t.key} item={t} on={t.key === tab} onPress={() => (t.key === 'instellingen' ? onSettings() : onChange(t.key))} />
        ))}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory },
  tabbar: { position: 'absolute', height: 64, borderRadius: 32, paddingHorizontal: 8 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rail: { position: 'absolute', right: 8, justifyContent: 'space-between' },
  railNav: { borderRadius: 32, paddingVertical: 8 },
  caption: { color: inkMuted, fontSize: 11, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
});
