import { Pressable, StyleSheet, Text, View, type PressableProps, type TextProps, type ViewStyle } from 'react-native';

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
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 26, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
