import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
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
import { T } from './src/ui';

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
      <StatusBar style={tab === 'feed' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'feed' ? (
          <FeedScreen
            feed={feed}
            profile={profile}
            refreshing={refreshing}
            onRefresh={refresh}
            onOpen={setOpen}
            onEditProfile={() => setEditing(true)}
          />
        ) : (
          <MapScreen feed={feed} profile={profile} onOpen={setOpen} />
        )}
      </View>
      <TabBar tab={tab} onChange={setTab} onSettings={() => setEditing(true)} />
    </View>
  );
}

function TabBar({ tab, onChange, onSettings }: { tab: Tab; onChange: (t: Tab) => void; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const items: { key: Tab | 'instellingen'; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'kaart', label: 'Kaart' },
    { key: 'instellingen', label: 'Adres' },
  ];
  return (
    <View style={[styles.tabbar, { paddingBottom: insets.bottom || 12 }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === tab;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => (it.key === 'instellingen' ? onSettings() : onChange(it.key))}
            style={styles.tab}
          >
            <View style={[styles.tabMark, on && { backgroundColor: colors.ink }]} />
            <T weight={on ? 'bold' : 'semibold'} style={{ fontSize: 12, color: on ? colors.ink : colors.textMuted }}>
              {it.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory },
  tabbar: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 4 },
  tabMark: { width: 24, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
});
