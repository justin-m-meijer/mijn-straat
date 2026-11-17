/**
 * Kleine visuele bouwstenen voor de cijferkaarten: inschuivende kaarten, groeiende staafjes,
 * gekleurde trendlabels en verdeelbalken. Alleen de ingebouwde Animated-API, geen extra pakketten.
 * Animaties respecteren "Verminder beweging" van het toestel.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, View, type ViewStyle } from 'react-native';

import { colors } from './theme';
import { T, inkMuted } from './ui';

export const tint = {
  goed: { bg: '#DDF0EA', fg: '#1F6152', solid: '#4FA28F' },
  let: { bg: '#FBE2CF', fg: '#83400F', solid: '#DE7432' },
  neutraal: { bg: '#E3ECF0', fg: colors.ink, solid: colors.media },
  slecht: { bg: '#F6D6D3', fg: '#8A2420', solid: '#D2504A' },
  geel: { bg: '#FBF0CC', fg: '#6E5210', solid: '#DDAE34' },
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduced).catch(() => {});
  }, []);
  return reduced;
}

/** Kaart die zacht omhoog schuift en verschijnt; `index` verspringt de start. */
export function FadeIn({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduced ? 0 : 420,
      delay: reduced ? 0 : 60 + index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, index, reduced]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** 0 → 1 na het verschijnen; voor staafjes en balken die "aangroeien". */
export function useGrow(delay = 150, duration = 650): Animated.Value {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduced ? 0 : duration,
      delay: reduced ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay, duration, reduced]);
  return v;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

type Reeks = (number | null)[] | undefined;

/**
 * Staafjes die van links naar rechts aangroeien. Kleur loopt van licht (laag) naar donker (hoog);
 * de laatste staaf krijgt `accent` als die is opgegeven.
 */
export function GrowBars({
  series,
  label,
  accent,
  height = 44,
  floorRatio = 0.8,
}: {
  series: Reeks;
  label: string;
  accent?: string;
  height?: number;
  floorRatio?: number;
}) {
  const grow = useGrow();
  const values = series ?? [];
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  // Basis net onder het minimum, zodat kleine verschillen zichtbaar zijn.
  const floor = min * floorRatio;
  const n = values.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }} accessibilityLabel={label}>
      {values.map((v, i) => {
        const rel = v == null ? 0 : (v - floor) / (max - floor || 1);
        const last = i === n - 1;
        const color = v == null ? colors.border : last && accent ? accent : mix('#CFE2E1', colors.ink, 0.25 + rel * 0.6);
        // Iedere staaf start iets later: een golf van links naar rechts.
        const scaleY = grow.interpolate({
          inputRange: [0, Math.min(0.99, (i / n) * 0.6), Math.min(1, (i / n) * 0.6 + 0.4)],
          outputRange: [0.02, 0.02, 1],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={{
              flex: 1,
              height: v == null ? 3 : 4 + rel * (height - 4),
              borderRadius: 3,
              backgroundColor: color,
              transformOrigin: 'bottom',
              transform: [{ scaleY }],
            }}
          />
        );
      })}
    </View>
  );
}

/** Gekleurd trendlabel, bijv. ▲ 4,2%. `upIsGood` bepaalt of stijgen groen of oranje is. */
export function Trend({ now, before, upIsGood, suffix }: { now: number; before: number; upIsGood?: boolean; suffix?: string }) {
  if (!before) return null;
  const d = ((now - before) / before) * 100;
  const flat = Math.abs(d) < 0.5;
  const good = upIsGood === undefined ? null : d > 0 === upIsGood;
  const t = flat || good === null ? tint.neutraal : good ? tint.goed : tint.let;
  const text = `${flat ? '■' : d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')}%${suffix ? ` ${suffix}` : ''}`;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T weight="bold" style={{ fontSize: 12, color: t.fg }}>
        {text}
      </T>
    </View>
  );
}

/** Horizontale verdeelbalk (som ≤ 100) met legenda; groeit open van links. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const grow = useGrow(250, 800);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return null;
  return (
    <View style={{ gap: 8 }} accessibilityLabel={parts.map((p) => `${p.label} ${Math.round(p.value)} procent`).join(', ')}>
      <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.border }}>
        <Animated.View style={{ flexDirection: 'row', flex: 1, transformOrigin: 'left', transform: [{ scaleX: grow }] }}>
          {parts.map((p) => (
            <View key={p.label} style={{ flex: p.value, backgroundColor: p.color }} />
          ))}
          {total < 100 && <View style={{ flex: 100 - total }} />}
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
            <T style={{ fontSize: 12, color: colors.textMuted }}>
              {p.label} <T weight="bold" style={{ fontSize: 12, color: colors.ink }}>{Math.round(p.value)}%</T>
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Twee waarden naast elkaar als horizontale balken, bijv. buurt tegenover gemeente. */
export function Compare({ rows, format }: { rows: { label: string; value: number; color: string }[]; format: (n: number) => string }) {
  const grow = useGrow(300, 700);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={{ fontSize: 12, color: colors.textMuted }}>{r.label}</T>
            <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
              {format(r.value)}
            </T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.ivory, overflow: 'hidden' }}>
            <Animated.View
              style={{ width: `${(r.value / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: r.color, transformOrigin: 'left', transform: [{ scaleX: grow }] }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Getaltegel met gekleurde rand links en optioneel een trend eronder. */
export function Tile({ label, value, note, accent = colors.sage, trend }: { label: string; value: string; note?: string; accent?: string; trend?: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.ivory,
        borderRadius: 12,
        borderLeftWidth: 5,
        borderLeftColor: accent,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: '47%',
        flexGrow: 1,
        gap: 3,
      }}
    >
      <T style={{ fontSize: 12, color: colors.textMuted }}>{label}</T>
      <T weight="bold" style={{ fontSize: 18, color: colors.ink }}>
        {value}
      </T>
      {trend}
      {!!note && <T style={{ fontSize: 11, color: inkMuted }}>{note}</T>}
    </View>
  );
}
