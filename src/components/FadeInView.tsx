import { useEffect } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

type FadeInViewProps = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  /** Distância do slide-up em pixels. 0 = só fade. */
  offsetY?: number;
  style?: ViewStyle | ViewStyle[];
};

/**
 * View que aparece com fade-in + slide-up sutil.
 * Por padrão entra em 280ms com 12px de offset.
 *
 * Uso típico:
 *   <FadeInView><MeuConteudo /></FadeInView>
 */
export function FadeInView({
  children,
  delay = 0,
  duration = 280,
  offsetY = 12,
  style,
}: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(offsetY);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration, easing: Easing.out(Easing.cubic) })
    );
  }, [delay, duration, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
}
