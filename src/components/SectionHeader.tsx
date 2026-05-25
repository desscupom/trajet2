import { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';

import { colors, fontSize, letterSpacing, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type SectionHeaderProps = {
  title: string;
  /** Texto opcional à direita (ex: contador). */
  count?: string | number;
  /** Slot custom à direita (ex: link "Ver todos"). */
  rightSlot?: React.ReactNode;
  /** Variante de cor. */
  tone?: 'default' | 'danger' | 'success';
  style?: StyleProp<ViewStyle>;
};

/**
 * Cabeçalho de seção padronizado. Pequeno, ALL CAPS, com letterSpacing largo.
 * Uniforme em todas as telas pra dar coesão visual.
 *
 * Uso:
 *   <SectionHeader title="Histórico" />
 *   <SectionHeader title="A fazer" count={pending.length} />
 *   <SectionHeader title="Zona perigosa" tone="danger" />
 */
export function SectionHeader({
  title,
  count,
  rightSlot,
  tone = 'default',
  style,
}: SectionHeaderProps) {
  const styles = useStyles();
  const titleStyle = [
    styles.title,
    tone === 'danger' && styles.titleDanger,
    tone === 'success' && styles.titleSuccess,
  ];

  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        <View
          style={[
            styles.accent,
            tone === 'danger' && styles.accentDanger,
            tone === 'success' && styles.accentSuccess,
          ]}
        />
        <Text style={titleStyle}>{title}</Text>
        {count !== undefined && (
          <View
            style={[
              styles.countPill,
              tone === 'danger' && styles.countPillDanger,
              tone === 'success' && styles.countPillSuccess,
            ]}
          >
            <Text
              style={[
                styles.countText,
                tone === 'danger' && styles.titleDanger,
                tone === 'success' && styles.titleSuccess,
              ]}
            >
              {count}
            </Text>
          </View>
        )}
      </View>
      {rightSlot && <View>{rightSlot}</View>}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  accentDanger: {
    backgroundColor: colors.danger,
  },
  accentSuccess: {
    backgroundColor: colors.success,
  },
  title: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  titleDanger: { color: colors.danger },
  titleSuccess: { color: colors.success },
  countPill: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    minWidth: 22,
    alignItems: 'center',
  },
  countPillDanger: { backgroundColor: colors.dangerSoft },
  countPillSuccess: { backgroundColor: colors.successSoft },
  countText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'none',
  },
}), [themeVersion]);
}
