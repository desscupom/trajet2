import {useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

/**
 * Input padrão com label estática em cima.
 * Foco: borda teal anima + ring sutil em volta (estilo Stripe).
 */
export function Input({
  label,
  error,
  helper,
  leftIcon,
  rightSlot,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  // Anima 0 (não focado) → 1 (focado) → 0 (blur)
  const focusAnim = useSharedValue(0);

  useEffect(() => {
    focusAnim.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focusAnim]);

  // Border color anima entre default e primary
  // Lê as cores do tema (theme) — funciona tanto pro dark quanto light.
  // Em vez de interpolar RGB manualmente (que tinha cores dark hardcoded),
  // alterna entre dois `borderColor` strings completos.
  const animatedBorder = useAnimatedStyle(() => {
    if (error) return { borderColor: colors.danger };
    // Quando focusAnim = 1 (foco), usa primary; quando 0, usa border padrão
    const t = focusAnim.value;
    if (t > 0.5) return { borderColor: colors.primary };
    return { borderColor: colors.border };
  });

  // Ring teal — aparece em volta no focus (offset com sombra)
  const animatedRing = useAnimatedStyle(() => ({
    opacity: error ? 0 : focusAnim.value * 0.35,
    transform: [{ scale: 1 + focusAnim.value * 0.01 }],
  }));

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View>
        {/* Ring atrás do field */}
        <Animated.View style={[styles.ring, animatedRing]} />

        <Animated.View style={[styles.fieldWrap, animatedBorder]}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          <TextInput
            {...rest}
            style={[styles.input, !!leftIcon && styles.inputWithIcon, style]}
            placeholderTextColor={colors.textDisabled}
            selectionColor={colors.primary}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
          />
          {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
        </Animated.View>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    fontWeight: '600',
    letterSpacing: letterSpacing.wide,
  },
  ring: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: radius.md + 3,
    backgroundColor: colors.primary,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 48,
  },
  iconLeft: {
    paddingLeft: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  rightSlot: {
    paddingRight: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  helper: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}
