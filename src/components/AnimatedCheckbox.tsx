import {useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Check } from '@/components/Icon';
import { colors } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type AnimatedCheckboxProps = {
  checked: boolean;
  onPress: () => void;
  size?: number;
};

/**
 * Checkbox com transição animada:
 * - Borda + background fazem morph suave entre vazio e teal
 * - O tick aparece com pop (escala 0 → 1.15 → 1)
 *
 * Performance: usa Reanimated worklets, roda na UI thread.
 */
export function AnimatedCheckbox({
  checked,
  onPress,
  size = 22,
}: AnimatedCheckboxProps) {
  const styles = useStyles();
  const fillProgress = useSharedValue(checked ? 1 : 0);
  const tickScale = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    if (checked) {
      fillProgress.value = withTiming(1, { duration: 180 });
      // Tick aparece com leve overshoot (1.15) e assenta em 1
      tickScale.value = withSpring(1, {
        damping: 12,
        stiffness: 220,
        mass: 0.6,
      });
    } else {
      fillProgress.value = withTiming(0, { duration: 180 });
      tickScale.value = withTiming(0, { duration: 120 });
    }
  }, [checked, fillProgress, tickScale]);

  // Borda e fundo fazem morph entre estados
  const boxStyle = useAnimatedStyle(() => {
    // Interpolamos manualmente: 0 = transparente, 1 = teal
    const r = 0.078 + (0.078 - 0.078) * fillProgress.value; // R do teal
    const g = 0.722 * fillProgress.value;
    const b = 0.65 * fillProgress.value;
    const a = fillProgress.value;
    return {
      backgroundColor: `rgba(20, 184, 166, ${a})`,
      borderColor: fillProgress.value > 0.5 ? colors.primary : colors.border,
    };
  });

  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tickScale.value }],
    opacity: tickScale.value,
  }));

  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.area}>
      <Animated.View
        style={[
          styles.box,
          { width: size, height: size, borderRadius: size * 0.27 },
          boxStyle,
        ]}
      >
        <Animated.View style={tickStyle}>
          <Check
            size={Math.round(size * 0.62)}
            color={colors.primaryTextOnSolid}
            strokeWidth={3}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  area: { paddingTop: 2 },
  box: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}), [themeVersion]);
}
