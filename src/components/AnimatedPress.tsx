import { forwardRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

type AnimatedPressProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Quanto encolher ao pressionar. 0.96 = encolhe 4%. */
  pressScale?: number;
  /** Reduzir opacidade ao pressionar. */
  pressOpacity?: number;
  children: React.ReactNode;
};

/**
 * Pressable com spring suave de escala ao pressionar.
 * Encolhe pro `pressScale` e volta com bounce ao soltar.
 *
 * Uso típico (substitui Pressable diretamente):
 *   <AnimatedPress onPress={handlePress}>
 *     <ThingToTap />
 *   </AnimatedPress>
 */
export const AnimatedPress = forwardRef<any, AnimatedPressProps>(
  function AnimatedPress(
    {
      onPressIn,
      onPressOut,
      style,
      pressScale = 0.97,
      pressOpacity = 0.9,
      children,
      ...rest
    },
    ref
  ) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    }));

    return (
      <AnimatedPressableBase
        ref={ref}
        {...rest}
        onPressIn={(e) => {
          scale.value = withSpring(pressScale, { damping: 18, stiffness: 320 });
          opacity.value = withTiming(pressOpacity, { duration: 80 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 18, stiffness: 280 });
          opacity.value = withTiming(1, { duration: 120 });
          onPressOut?.(e);
        }}
        style={[animatedStyle, style as any]}
      >
        {children}
      </AnimatedPressableBase>
    );
  }
);
