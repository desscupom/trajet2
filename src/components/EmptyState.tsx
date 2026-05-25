import {useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
};

/**
 * Estado vazio elegante com:
 * - Círculos concêntricos sutis em volta do ícone (rings teal de opacidade decrescente)
 * - Animação de entrada (scale com leve overshoot)
 * - Stagger no título e descrição
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const styles = useStyles();
  // Animação do ícone — entra com spring
  const iconScale = useSharedValue(0);
  const iconOpacity = useSharedValue(0);

  // Stagger: título e descrição entram depois
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(8);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 300 });
    iconScale.value = withSpring(1, {
      damping: 12,
      stiffness: 180,
      mass: 0.8,
    });
    textOpacity.value = withDelay(120, withTiming(1, { duration: 280 }));
    textY.value = withDelay(120, withTiming(0, { duration: 280 }));
  }, [iconOpacity, iconScale, textOpacity, textY]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconArea, iconWrapStyle]}>
        {/* Círculos decorativos concêntricos */}
        <View style={[styles.ring, styles.ringOuter, { pointerEvents: "none" }]} />
        <View style={[styles.ring, styles.ringMid, { pointerEvents: "none" }]} />
        <View style={styles.iconWrap}>{icon}</View>
      </Animated.View>

      <Animated.View style={textStyle}>
        <Text style={styles.title}>{title}</Text>
        {!!description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </Animated.View>

      {action && (
        <Animated.View style={[textStyle, styles.actionWrap]}>
          <Button
            title={action.label}
            onPress={action.onPress}
            variant="primary"
            style={styles.action}
          />
        </Animated.View>
      )}
    </View>
  );
}

const RING_OUTER_SIZE = 180;
const RING_MID_SIZE = 130;
const ICON_BOX_SIZE = 80;

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconArea: {
    width: RING_OUTER_SIZE,
    height: RING_OUTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  ringOuter: {
    width: RING_OUTER_SIZE,
    height: RING_OUTER_SIZE,
    borderColor: colors.primary,
    opacity: 0.06,
  },
  ringMid: {
    width: RING_MID_SIZE,
    height: RING_MID_SIZE,
    borderColor: colors.primary,
    opacity: 0.12,
  },
  iconWrap: {
    width: ICON_BOX_SIZE,
    height: ICON_BOX_SIZE,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30', // 19% alpha
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
    letterSpacing: letterSpacing.tight,
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  actionWrap: {
    marginTop: spacing.lg,
  },
  action: {
    minWidth: 200,
  },
}), [themeVersion]);
}
