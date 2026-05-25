import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  spacing,
} from '@/lib/theme';

export type CategorySegment = {
  /** Identifier (ex: 'food', 'lodging') */
  key: string;
  /** Texto pra mostrar (ex: 'Comida') */
  label: string;
  /** Valor absoluto */
  value: number;
  /** Cor do segmento */
  color: string;
  /** Ícone opcional pra mostrar na legenda */
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
};

type Props = {
  segments: CategorySegment[];
  /** Texto central (ex: total) */
  centerTitle?: string;
  centerSubtitle?: string;
  size?: number;
  strokeWidth?: number;
};

/**
 * Donut chart minimalista. Mostra segmentos por categoria com legenda à direita.
 *
 * Implementação: usa Circle com strokeDasharray + strokeDashoffset pra
 * desenhar cada arco. Cada segmento começa onde o anterior terminou.
 */
export function CategoryDonut({
  segments,
  centerTitle,
  centerSubtitle,
  size = 140,
  strokeWidth = 16,
}: Props) {
  const styles = useStyles();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sem dados pra mostrar</Text>
      </View>
    );
  }

  // Calcula offsets cumulativos
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.value / total;
    const dash = fraction * circumference;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    return { ...seg, dash, offset, fraction };
  });

  return (
    <View style={styles.container}>
      <View style={styles.donutWrap}>
        <Svg width={size} height={size}>
          {/* Track de fundo */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.surfaceAlt}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Arcos rotacionados pra começar no topo */}
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {arcs.map((arc) => (
              <Circle
                key={arc.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={arc.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>
        {/* Conteúdo central absoluto */}
        {(centerTitle || centerSubtitle) && (
          <View style={styles.centerContent} pointerEvents="none">
            {centerSubtitle && (
              <Text style={styles.centerSubtitle}>{centerSubtitle}</Text>
            )}
            {centerTitle && <Text style={styles.centerTitle}>{centerTitle}</Text>}
          </View>
        )}
      </View>

      {/* Legenda à direita */}
      <View style={styles.legend}>
        {arcs.map((arc) => {
          const Icon = arc.Icon;
          return (
            <View key={arc.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: arc.color }]} />
              {Icon && (
                <Icon size={12} color={colors.textMuted} />
              )}
              <Text style={styles.legendLabel} numberOfLines={1}>
                {arc.label}
              </Text>
              <Text style={styles.legendPct}>
                {Math.round(arc.fraction * 100)}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  donutWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
  },
  centerSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  legend: {
    flex: 1,
    gap: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  legendPct: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  empty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
}), [themeVersion]);
}
