import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';


import { colors, spacing as themeSpacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type DividerProps = {
  /** Margem vertical em volta. Default 'md' (12). */
  spacing?: 'sm' | 'md' | 'lg' | 'xl';
  /** 'subtle' (cinza fade) ou 'accent' (teal fade). */
  variant?: 'subtle' | 'accent';
};

/**
 * Divider com gradient horizontal — fade pra fora, mais visível no centro.
 * Sutil e elegante, melhor que uma border cinza sólida.
 */
export function Divider({
  spacing = 'md',
  variant = 'subtle',
}: DividerProps) {
  const styles = useStyles();
  const gradColors: [string, string, string] =
    variant === 'accent'
      ? ['transparent', colors.primary + '40', 'transparent']
      : ['transparent', colors.border, 'transparent'];

  const marginVertical = MARGINS[spacing];

  return (
    <View style={[styles.line, { marginVertical }]} />
  );
}

const MARGINS = {
  sm: themeSpacing.sm,
  md: themeSpacing.md,
  lg: themeSpacing.lg,
  xl: themeSpacing.xl,
};

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  line: {
    height: 1,
    width: '100%',
  },
}), [themeVersion]);
}
