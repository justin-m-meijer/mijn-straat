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
import { RADII, formatRadius } from './src/geo';
import { Glass, T, useSideStrip } from './src/ui';

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

/** Navigatie in de zijstrook van brede/vouwbare toestellen: zwevend glazen paneel met straal en tabs. */
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
  const street = profile.address.split(',')[0];
  const top = insets.top + STATUS_CLUSTER_HEIGHT;
  return (
    <>
      {/* effen achter de statusiconen, zodat tijd en wifi altijd leesbaar zijn */}
      <View style={[styles.railStatus, { width, height: top }]} />
      <Glass tint={colors.ink} dark style={[styles.rail, { width: width - 12, top, bottom: insets.bottom + 12 }]}>
        <View style={{ gap: 6 }} accessibilityRole="radiogroup">
          <Pressable accessibilityRole="button" accessibilityHint="Adres wijzigen" onPress={onSettings} style={{ marginBottom: 6 }}>
            <T weight="semibold" style={{ color: '#E5EEEE', fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
              {street}
            </T>
          </Pressable>
          {RADII.map((r) => {
            const on = r === profile.radius;
            return (
              <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onRadiusChange(r)}>
                <Glass interactive dark tint={on ? colors.sage : undefined} solid="rgba(255,255,255,0.12)" style={styles.railPill}>
                  <T weight={on ? 'bold' : 'semibold'} style={{ color: on ? colors.ink : colors.white, fontSize: 12 }} numberOfLines={1}>
                    {r ? formatRadius(r) : 'Gemeente'}
                  </T>
                </Glass>
              </Pressable>
            );
          })}
        </View>
        <View style={{ gap: 4 }} accessibilityRole="tablist">
          {TABS.map(({ key, label }) => {
            const on = key === tab;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => (key === 'instellingen' ? onSettings() : onChange(key))}
              >
                <Glass interactive dark tint={on ? colors.sage : undefined} solid="transparent" style={styles.railTab}>
                  <T weight={on ? 'bold' : 'semibold'} style={{ fontSize: 13, color: on ? colors.ink : '#D5E2E6' }}>
                    {label}
                  </T>
                </Glass>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </>
  );
}

const TABS: { key: Tab | 'instellingen'; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'kaart', label: 'Kaart' },
  { key: 'instellingen', label: 'Adres' },
];

/** Zwevende glazen tabbalk op gewone telefoons; de lijst en kaart lopen eronder door. */
function TabBar({ tab, onChange, onSettings }: { tab: Tab; onChange: (t: Tab) => void; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Glass style={[styles.tabbar, { bottom: (insets.bottom || 12) + 4, left: 24 + insets.left, right: 24 + insets.right }]}>
      <View style={{ flexDirection: 'row', flex: 1 }} accessibilityRole="tablist">
        {TABS.map(({ key, label }) => {
          const on = key === tab;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => (key === 'instellingen' ? onSettings() : onChange(key))}
              style={styles.tab}
            >
              <Glass interactive tint={on ? colors.sage : undefined} solid="transparent" style={styles.tabPill}>
                <T weight={on ? 'bold' : 'semibold'} style={{ fontSize: 13, color: on ? colors.ink : colors.textMuted }}>
                  {label}
                </T>
              </Glass>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ivory },
  tabbar: { position: 'absolute', height: 60, borderRadius: 30, padding: 6 },
  tab: { flex: 1 },
  tabPill: { flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  railStatus: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.ink },
  rail: { position: 'absolute', right: 6, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 12, justifyContent: 'space-between' },
  railPill: { minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  railTab: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
