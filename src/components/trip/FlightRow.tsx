/**
 * FlightRow — card visual para voos importados no roteiro.
 * Aparece diferenciado do ItineraryRow padrão, com estilo de
 * bilhete aéreo: origem → destino, horário, companhia.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from '@/components/Icon';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';
import type { ItineraryItem } from './types';

type Props = {
  item: ItineraryItem;
  onRemove: () => void;
};

/**
 * Tenta extrair origem e destino do título do voo.
 * Ex: "✈ GOL 7221 · FLN → AEP · 05:40" → { origin: 'FLN', dest: 'AEP', code: 'GOL 7221', time: '05:40' }
 */
function parseFlightTitle(title: string) {
  // Tenta extrair código IATA (3 letras maiúsculas)
  const iataMatch = title.match(/([A-Z]{3})\s*→\s*([A-Z]{3})/);
  const origin = iataMatch?.[1] ?? null;
  const dest = iataMatch?.[2] ?? null;

  // Código do voo (ex: GOL 7221, LA 3456)
  const codeMatch = title.match(/([A-Z]{2,3}\s*\d{2,4})/);
  const flightCode = codeMatch?.[1] ?? null;

  // Horário
  const timeMatch = title.match(/(\d{2}:\d{2})/);
  const time = timeMatch?.[1] ?? null;

  // Companhia (primeira palavra uppercase)
  const airlineMatch = title.match(/✈[^\w]*([A-Z][A-Za-z]+)/);
  const airline = airlineMatch?.[1] ?? null;

  return { origin, dest, flightCode, time, airline };
}

export function FlightRow({ item, onRemove }: Props) {
  const styles = useStyles();
  const title = item.custom_title ?? '';
  const { origin, dest, flightCode, time, airline } = useMemo(() => parseFlightTitle(title), [title]);
  const displayTime = item.start_time?.slice(0, 5) ?? time;

  return (
    <View style={styles.wrapper}>
      {/* Linha do tempo — mesma estrutura do ItineraryRow */}
      <View style={styles.timelineCol}>
        {displayTime ? (
          <View style={styles.timeBlock}>
            <Text style={styles.timeHour}>{displayTime}</Text>
          </View>
        ) : (
          <View style={styles.timeDot} />
        )}
        <View style={styles.timelineLine} />
      </View>

      {/* Card de voo */}
      <View style={styles.cardOuter}>
        <View style={styles.card}>
          {/* Header azul */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>✈</Text>
            <Text style={styles.headerLabel}>Voo{flightCode ? ` · ${flightCode}` : ''}</Text>
            <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
              <X size={13} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          {/* Rota */}
          <View style={styles.routeRow}>
            {origin && dest ? (
              <>
                <View style={styles.airport}>
                  <Text style={styles.iata}>{origin}</Text>
                  {displayTime && <Text style={styles.airportTime}>{displayTime}</Text>}
                </View>
                <View style={styles.routeMiddle}>
                  <View style={styles.routeLine} />
                  <Text style={styles.planeIcon}>✈</Text>
                  <View style={styles.routeLine} />
                </View>
                <View style={[styles.airport, { alignItems: 'flex-end' }]}>
                  <Text style={styles.iata}>{dest}</Text>
                  <Text style={styles.airportTime}>chegada</Text>
                </View>
              </>
            ) : (
              <Text style={styles.titleFallback} numberOfLines={2}>{title.replace('✈', '').trim()}</Text>
            )}
          </View>

          {/* Notas / airline */}
          {(airline || item.notes) && (
            <Text style={styles.notes} numberOfLines={1}>
              {airline ?? ''}{airline && item.notes ? ' · ' : ''}{item.notes ?? ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    timelineCol: {
      width: 44,
      alignItems: 'center',
      paddingTop: 2,
    },
    timeBlock: {
      alignItems: 'center',
      marginBottom: 2,
    },
    timeHour: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    timeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 4,
    },
    timelineLine: {
      flex: 1,
      width: 1.5,
      backgroundColor: colors.border,
      marginTop: 4,
    },
    cardOuter: {
      flex: 1,
      paddingRight: spacing.md,
      paddingBottom: 4,
    },
    card: {
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(37,99,235,0.3)',
      backgroundColor: 'rgba(37,99,235,0.05)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(37,99,235,0.85)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    headerIcon: {
      fontSize: 11,
      color: '#fff',
    },
    headerLabel: {
      flex: 1,
      color: '#fff',
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    removeBtn: {
      padding: 2,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    airport: {
      alignItems: 'flex-start',
      minWidth: 44,
    },
    iata: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    airportTime: {
      color: colors.textMuted,
      fontSize: 10,
      marginTop: 1,
    },
    routeMiddle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
    },
    routeLine: {
      flex: 1,
      height: 1,
      backgroundColor: 'rgba(37,99,235,0.3)',
    },
    planeIcon: {
      color: 'rgba(37,99,235,0.6)',
      fontSize: 12,
      marginHorizontal: 4,
    },
    titleFallback: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.sm,
      fontWeight: '600',
    },
    notes: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
  }), [themeVersion]);
}
