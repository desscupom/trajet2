import { useEffect, useState, useMemo } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Skeleton com shimmer — implementado sem expo-linear-gradient
 * para evitar crash no iOS 26 beta (LinearGradientLayer SIGSEGV).
 * Usa Animated.View com opacidade pulsante como fallback estável.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: br = radius.sm,
  style,
}: SkeletonProps) {
  const styles = useStyles();
  const [containerWidth, setContainerWidth] = useState(0);
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true // reverso — vai e volta suavemente
    );
  }, [shimmerProgress]);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = containerWidth > 0
      ? -containerWidth + shimmerProgress.value * containerWidth * 2
      : 0;
    return {
      transform: [{ translateX }],
      opacity: 0.06 + shimmerProgress.value * 0.12,
    };
  });

  function handleLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius: br },
        style,
      ]}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.shimmerWrap,
            { width: containerWidth * 0.5 },
            shimmerStyle,
          ]}
        />
      )}
    </View>
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Skeleton height={20} width="60%" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 2 ? '40%' : '90%'}
          style={{ marginTop: spacing.sm }}
        />
      ))}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
    skeleton: {
      backgroundColor: colors.shimmer,
      overflow: 'hidden',
    },
    shimmerWrap: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
  }), [themeVersion]);
}
