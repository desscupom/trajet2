import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Props = {
  title: string;
  description: string;
};

export function ComingSoonTab({ title, description }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🚧</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.tag}>Em breve</Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  icon: { fontSize: 48, marginBottom: spacing.sm },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  tag: {
    marginTop: spacing.md,
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
}), [themeVersion]);
}
