import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon,
  fullWidth,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const styles = useStyles();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.primaryTextOnSolid : colors.text}
          size="small"
        />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          <Text style={[styles.text, textVariantStyles[variant], textSizeStyles[size]]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconLeft: {
    marginLeft: -2,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.4,
  },
}), [themeVersion]);
}

const sizeStyles = StyleSheet.create({
  sm: {
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.md,
  },
  md: {
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
    borderRadius: radius.lg,
  },
  lg: {
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
    borderRadius: radius.lg,
  },
});

const textSizeStyles = StyleSheet.create({
  sm: { fontSize: fontSize.sm, fontWeight: '600' },
  md: { fontSize: fontSize.md, fontWeight: '600' },
  lg: { fontSize: fontSize.md, fontWeight: '700' },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    shadowColor: '#7b2fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
});

const textVariantStyles = StyleSheet.create({
  primary: {
    color: colors.primaryTextOnSolid,
    letterSpacing: -0.2,
  },
  secondary: {
    color: colors.text,
  },
  ghost: {
    color: colors.primary,
    fontWeight: '600',
  },
  danger: {
    color: colors.danger,
  },
});
