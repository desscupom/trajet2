import { useLocalSearchParams, useRouter } from 'expo-router';
import {useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Calendar, MapPin } from '@/components/Icon';
import { formatDateBR, formatDateLongBR, formatDateRangeBR } from '@/lib/dates';
import {
  fetchPublicTrip,
  type PublicTripPayload,
} from '@/lib/publicShare';
import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';

/**
 * Tela pública (sem auth) que exibe uma viagem compartilhada via link.
 *
 * Acesso: /p/<token> (rota livre — não exige login).
 * Carrega dados via Edge Function `public-trip` que valida o token.
 *
 * Limitações por design:
 * - Read-only — sem botões de editar/deletar
 * - Só mostra o que `share.includeXxx` permite
 * - Sem barra de tabs nem outros elementos do app autenticado
 */
export default function PublicTripScreen() {
  const styles = useStyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [data, setData] = useState<PublicTripPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Link inválido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPublicTrip(token)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Erro ao carregar viagem');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando viagem…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Ops</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { trip, days, items, lodgings, share } = data;

  const dateRange =
    trip.start_date && trip.end_date
      ? formatDateRangeBR(trip.start_date, trip.end_date)
      : trip.start_date
        ? `A partir de ${formatDateBR(trip.start_date)}`
        : 'Sem datas';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* HERO */}
        {trip.cover_image_url ? (
          <View style={styles.hero}>
            <Image
              source={{ uri: trip.cover_image_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <View style={styles.heroOverlay}>
              <Text style={styles.heroLabel}>Roteiro de viagem</Text>
              <Text style={styles.heroTitle}>{trip.title}</Text>
              <Text style={styles.heroDates}>{dateRange}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.heroNoImage}>
            <Text style={styles.heroLabel}>Roteiro de viagem</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              {trip.title}
            </Text>
            <Text style={[styles.heroDates, { color: colors.textMuted }]}>
              {dateRange}
            </Text>
          </View>
        )}

        {trip.description && (
          <View style={styles.descriptionWrap}>
            <Text style={styles.description}>{trip.description}</Text>
          </View>
        )}

        {/* HOSPEDAGENS */}
        {share.includeLodgings && lodgings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hospedagens</Text>
            {lodgings.map((l: any) => (
              <View key={l.id} style={styles.lodgingCard}>
                <Text style={styles.lodgingName}>{l.name}</Text>
                {l.address && (
                  <Text style={styles.lodgingAddress}>{l.address}</Text>
                )}
                {l.check_in_at && l.check_out_at && (
                  <Text style={styles.lodgingDates}>
                    {formatDateBR(l.check_in_at.split('T')[0])} →{' '}
                    {formatDateBR(l.check_out_at.split('T')[0])}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ROTEIRO */}
        {days.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Roteiro</Text>
            {days.map((day, idx) => {
              const dayItems = items
                .filter((i) => i.trip_day_id === day.id)
                .sort((a, b) => {
                  if (a.start_time && b.start_time)
                    return a.start_time.localeCompare(b.start_time);
                  return a.position - b.position;
                });
              return (
                <View key={day.id} style={styles.dayBlock}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayNumber}>DIA {idx + 1}</Text>
                    <Text style={styles.dayDate}>
                      {formatDateLongBR(day.day_date)}
                    </Text>
                  </View>
                  {dayItems.length === 0 ? (
                    <Text style={styles.emptyDayText}>Sem lugares planejados</Text>
                  ) : (
                    dayItems.map((item) => (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={styles.itemTime}>
                          {item.start_time ?? '—'}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            {item.place?.name ?? item.custom_title ?? 'Sem nome'}
                          </Text>
                          {item.place?.address && (
                            <Text style={styles.itemAddress}>
                              <MapPin size={10} color={colors.textMuted} />{' '}
                              {item.place.address}
                            </Text>
                          )}
                          {item.notes && (
                            <Text style={styles.itemNotes}>{item.notes}</Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Compartilhado via Trajet</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  errorMessage: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    position: 'relative',
    height: 280,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    // Gradient simulado com bg semi-transparente
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroNoImage: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: '#fff',
    fontSize: fontSize.xxl,
    fontWeight: '800',
    lineHeight: 36,
  },
  heroDates: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.md,
    marginTop: 4,
  },
  descriptionWrap: {
    padding: spacing.lg,
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  section: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  lodgingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  lodgingName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  lodgingAddress: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  lodgingDates: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 4,
  },
  dayBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  dayNumber: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
  },
  dayDate: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  emptyDayText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  itemTime: {
    width: 50,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  itemName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  itemAddress: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  itemNotes: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: 2,
  },
  footer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
}), [themeVersion]);
}
