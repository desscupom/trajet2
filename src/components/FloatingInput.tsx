import {useEffect, useRef, useState, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Props = TextInputProps & {
  label: string;
  error?: string;
  helper?: string;
};

/**
 * Input com label que flutua pra cima quando focado ou preenchido.
 * Design "premium" estilo Material 3 / Stripe.
 *
 * Estados:
 * - Vazio + sem foco: label centralizada como placeholder
 * - Vazio + foco OU preenchido: label sobe pequena pro topo, em teal
 */
export function FloatingInput({
  label,
  error,
  helper,
  value,
  onFocus,
  onBlur,
  style,
  ...rest
}: Props) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const hasValue = !!(value && String(value).length > 0);
  const elevated = focused || hasValue;

  // 0 = label dentro (placeholder), 1 = label flutuando em cima
  const floatAnim = useSharedValue(elevated ? 1 : 0);
  const focusAnim = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    floatAnim.value = withTiming(elevated ? 1 : 0, { duration: 200 });
  }, [elevated, floatAnim]);

  useEffect(() => {
    focusAnim.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focusAnim]);

  const animatedLabel = useAnimatedStyle(() => {
    const translateY = interpolate(floatAnim.value, [0, 1], [0, -22]);
    const scale = interpolate(floatAnim.value, [0, 1], [1, 0.78]);
    // Cor: muted → teal quando focado
    const r = 0x94 + (0x14 - 0x94) * focusAnim.value;
    const g = 0xa3 + (0xb8 - 0xa3) * focusAnim.value;
    const b = 0xb8 + (0xa6 - 0xb8) * focusAnim.value;
    return {
      transform: [{ translateY }, { scale }],
      color: error
        ? colors.danger
        : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
    };
  });

  const animatedBorder = useAnimatedStyle(() => {
    const r = 0x2a + (0x14 - 0x2a) * focusAnim.value;
    const g = 0x33 + (0xb8 - 0x33) * focusAnim.value;
    const b = 0x49 + (0xa6 - 0x49) * focusAnim.value;
    return {
      borderColor: error
        ? colors.danger
        : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
    };
  });

  return (
    <View style={styles.container}>
      <Pressable onPress={() => inputRef.current?.focus()}>
        <Animated.View style={[styles.fieldWrap, animatedBorder]}>
          {/* Label flutuante */}
          <View style={[styles.labelWrap, { pointerEvents: "none" }]}>
            <Animated.Text style={[styles.label, animatedLabel]}>
              {label}
            </Animated.Text>
          </View>

          <TextInput
            ref={inputRef}
            {...rest}
            value={value}
            style={[styles.input, style]}
            placeholderTextColor="transparent"
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
        </Animated.View>
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: { width: '100%' },
  fieldWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    minHeight: 56,
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: spacing.md,
    justifyContent: 'flex-end',
  },
  labelWrap: {
    position: 'absolute',
    left: spacing.md,
    top: 17,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  input: {
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
    margin: 0,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  helper: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}
