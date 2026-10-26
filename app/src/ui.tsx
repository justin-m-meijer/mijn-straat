import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categories, colors, fonts, type Category } from './theme';

type Weight = keyof typeof fonts;

export function T({ weight = 'regular', style, ...rest }: TextProps & { weight?: Weight }) {
  return <Text {...rest} style={[{ fontFamily: fonts[weight], color: colors.text }, style]} />;
}

export function Button({
  label,
  variant = 'primary',
  style,
  ...rest
}: PressableProps & { label: string; variant?: 'primary' | 'secondary' | 'accent'; style?: ViewStyle }) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [styles.button, v.box, pressed && { opacity: 0.8 }, rest.disabled && { opacity: 0.5 }, style]}
    >
      <T weight="bold" style={{ color: v.text, fontSize: 16 }}>
        {label}
      </T>
    </Pressable>
  );
}

const buttonVariants = {
  primary: { box: { backgroundColor: colors.ink }, text: colors.white },
  accent: { box: { backgroundColor: colors.sage }, text: colors.ink },
  secondary: { box: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputBorder }, text: colors.text },
};

export function CategoryBadge({ category }: { category: Category }) {
  const c = categories[category];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <T weight="bold" style={{ color: c.fg, fontSize: 12 }}>
        {c.label}
      </T>
    </View>
  );
}

export function CategoryDot({ category, size = 40 }: { category: Category; size?: number }) {
  const c = categories[category];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.3, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T weight="extrabold" style={{ color: c.fg, fontSize: size * 0.4 }}>
        {c.letter}
      </T>
    </View>
  );
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}

export function formatDateLong(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Brede schermen (vouwbare telefoons, iPad): inhoud niet breder dan dit, gecentreerd.
export const MAX_CONTENT_WIDTH = 680;

// iPhone Duo e.d.: een brede strook opzij (statusbalk staat daar) gebruiken we als navigatierail.
export const SIDE_STRIP_MIN = 56;

export function useSideStrip(): number {
  const insets = useSafeAreaInsets();
  return insets.right >= SIDE_STRIP_MIN ? insets.right : 0;
}

// Zijmarges die rekening houden met camera-uitsparingen en afgeronde hoeken links/rechts.
export function useSidePadding(base = 16) {
  const insets = useSafeAreaInsets();
  return { paddingLeft: base + insets.left, paddingRight: base + insets.right };
}

export const column: ViewStyle = { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' };

const styles = StyleSheet.create({
  // capsules: container en segmenten even rond, 4pt binnenmarge
  segments: { borderRadius: 22, padding: 4 },
  segment: { minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  button: { minHeight: 52, borderRadius: 26, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});

// Liquid Glass (iOS 26+). Daarbuiten blur, en bij "Verminder transparantie" een effen kleur.
type GlassMode = 'glass' | 'blur' | 'solid';

const liquidGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

export function useGlassMode(): GlassMode {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, []);
  if (reduce) return 'solid';
  return liquidGlass ? 'glass' : 'blur';
}

/**
 * Zwevende glazen laag voor navigatie en knoppen boven scrollende inhoud.
 * `tint` kleurt het glas (Jumpstart ink of sage); `solid` is de kleur zonder glas.
 */
export function Glass({
  style,
  tint,
  solid = colors.white,
  dark = false,
  interactive = false,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  tint?: ColorValue;
  solid?: ColorValue;
  dark?: boolean;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const mode = useGlassMode();
  if (mode === 'glass') {
    return (
      <GlassView style={style} tintColor={tint} isInteractive={interactive} colorScheme={dark ? 'dark' : 'light'}>
        {children}
      </GlassView>
    );
  }
  if (mode === 'blur') {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={40} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.55 }]} /> : null}
        {children}
      </View>
    );
  }
  return <View style={[style, { backgroundColor: tint ?? solid }]}>{children}</View>;
}

// Ruimte onder de lijst voor de zwevende tabbalk op gewone telefoons.
export const FLOATING_TAB_SPACE = 96;

export const inkMuted = 'rgba(31,78,99,0.55)';

/** Groepeert glazen vormen zodat ze als één familie samensmelten (alleen bij Liquid Glass). */
export function GlassGroup({ style, spacing = 8, children }: { style?: StyleProp<ViewStyle>; spacing?: number; children?: ReactNode }) {
  const mode = useGlassMode();
  if (mode === 'glass') {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}

/** Straalkeuze als één glazen gesegmenteerde control: horizontaal onder de titel, verticaal in de zijrail. */
export function RadiusControl({
  radii,
  value,
  onChange,
  vertical = false,
  wholeLabel = 'Alles',
}: {
  radii: number[];
  value: number;
  onChange: (radius: number) => void;
  vertical?: boolean;
  wholeLabel?: string;
}) {
  return (
    <Glass style={[styles.segments, vertical ? null : { flexDirection: 'row' }]}>
      <View style={[{ gap: 4 }, vertical ? null : { flexDirection: 'row', flex: 1 }]} accessibilityRole="radiogroup">
        {radii.map((r) => {
          const on = r === value;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(r)}
              style={[styles.segment, vertical ? null : { flex: 1 }, on && { backgroundColor: colors.ink }]}
            >
              <T weight={on ? 'bold' : 'semibold'} style={{ color: on ? colors.white : colors.ink, fontSize: 13 }}>
                {r ? `${r / 1000} km` : wholeLabel}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}
