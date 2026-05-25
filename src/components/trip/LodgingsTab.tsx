import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { Hotel, KeyRound, MapPin, Plus, Sparkles, Wallet } from '@/components/Icon';
import { LODGING_KIND_ICONS } from '@/components/lodgingIcons';
import { ImportLodgingModal } from '@/components/trip/ImportLodgingModal';
import { LodgingModal } from '@/components/trip/LodgingModal';
import { SuggestLodgingsModal } from '@/components/trip/SuggestLodgingsModal';
import { Skeleton } from '@/components/Skeleton';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import {
  formatLodgingDate,
  formatLodgingDateTime,
  getLodgingStatus,
  getNights,
  LODGING_KIND_LABELS,
  type Lodging,
  type LodgingStatus,
  sortLodgings,
} from '@/lib/lodgings';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase, type Trip } from '@/lib/supabase';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Props = {
  trip: Trip;
};

export function LodgingsTab({ trip }: Props) {
  const styles = useStyles();
  const router = useRouter();
  const [lodgings, setLodgings] = useState<Lodging[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lodging | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const fetchLodgings = useCallback(async () => {
    const { data, error } = await supabase
      .from('lodgings')
      .select('*')
      .eq('trip_id', trip.id);
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    setLodgings(sortLodgings((data ?? []) as Lodging[]));
    setLoading(false);
  }, [trip.id]);

  const refreshProps = usePullToRefresh(fetchLodgings);

  useFocusEffect(
    useCallback(() => {
      fetchLodgings();
    }, [fetchLodgings])
  );

  // Realtime
  useRealtimeTable({
    table: 'lodgings',
    filter: `trip_id=eq.${trip.id}`,
    onChange: () => {
      fetchLodgings();
    },
  });

  const sorted = useMemo(() => sortLodgings(lodgings), [lodgings]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openDetail(lodging: Lodging) {
    router.push(`/(app)/trip/${trip.id}/lodging/${lodging.id}` as any);
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.cardSkeleton}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={14} width="40%" style={{ marginTop: 8 }} />
            <Skeleton height={14} width="80%" style={{ marginTop: 12 }} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <>
      {sorted.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Hotel size={28} color={colors.primary} />}
            title="Sem hospedagens ainda"
            description="Adicione hotéis, Airbnbs ou casas de amigos pra organizar onde você vai dormir."
            action={{ label: 'Adicionar primeira hospedagem', onPress: openCreate }}
          />
          <View style={styles.emptyAction}>
            <Button
              title="Sugerir com IA"
              variant="ghost"
              size="sm"
              leftIcon={<Sparkles size={14} color={colors.primary} />}
              onPress={() => setSuggestOpen(true)}
            />
            <Button
              title="Importar de email"
              variant="ghost"
              size="sm"
              leftIcon={<Hotel size={14} color={colors.primary} />}
              onPress={() => setImportOpen(true)}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl {...refreshProps} />}
          ListHeaderComponent={
            <View style={styles.headerActions}>
              <Button
                title="Sugerir com IA"
                variant="ghost"
                size="sm"
                leftIcon={<Sparkles size={14} color={colors.primary} />}
                onPress={() => setSuggestOpen(true)}
              />
              <Button
                title="Importar hospedagem"
                variant="ghost"
                size="sm"
                leftIcon={<Hotel size={14} color={colors.primary} />}
                onPress={() => setImportOpen(true)}
              />
            </View>
          }
          renderItem={({ item, index }) => (
            <FadeInView delay={getStaggerDelay(index)}>
              <LodgingCard lodging={item} onPress={() => openDetail(item)} />
            </FadeInView>
          )}
        />
      )}

      {/* FAB pra adicionar */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <AnimatedPress
          onPress={() => {
            setAddMenuOpen(true);
          }}
          pressScale={0.92}
          style={styles.fab}
        >
          <Plus size={22} color={colors.primaryTextOnSolid} />
        </AnimatedPress>
      </View>

      <ActionSheet
        visible={addMenuOpen}
        title="Adicionar hospedagem"
        subtitle="Como você quer adicionar?"
        onClose={() => setAddMenuOpen(false)}
        options={[
          {
            icon: '✦',
            label: 'Sugerir com IA',
            sublabel: 'A IA pesquisa opções para o destino e período da viagem',
            onPress: () => setSuggestOpen(true),
          },
          {
            icon: '📧',
            label: 'Importar de e-mail',
            sublabel: 'Cole o conteúdo de um e-mail de confirmação',
            onPress: () => setImportOpen(true),
          },
          {
            icon: '✏️',
            label: 'Adicionar manualmente',
            sublabel: 'Preencha os dados da hospedagem',
            onPress: openCreate,
          },
        ]}
      />

      <LodgingModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        lodging={editing}
        tripId={trip.id}
        tripBaseCurrency={trip.base_currency}
        tripTitle={trip.title}
        tripFeatureExpenses={trip.feature_expenses !== false}
      />

      <ImportLodgingModal
        trip={trip}
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchLodgings}
      />

      <SuggestLodgingsModal
        trip={trip}
        visible={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        onApplied={fetchLodgings}
      />
    </>
  );
}

/**
 * Card de uma hospedagem.
 * Layout:
 * - Linha do topo: ícone do tipo + nome + (badge de status se houver)
 * - Linha de datas: check-in → check-out, X noites
 * - Endereço (se houver)
 * - Pé: código de reserva + valor (se houver)
 */
function LodgingCard({
  lodging,
  onPress,
}: {
  lodging: Lodging;
  onPress: () => void;
}) {
  const styles = useStyles();
  const status = getLodgingStatus(lodging);
  const nights = getNights(lodging);
  const Icon = LODGING_KIND_ICONS[(lodging.kind as keyof typeof LODGING_KIND_ICONS) ?? 'other'];
  const amenities = (lodging.amenities ?? []) as string[];
  const topAmenities = amenities.slice(0, 3);

  const AMENITY_EMOJI: Record<string, string> = {
    wifi: '📶', pool: '🏊', breakfast: '🍳', parking: '🅿️',
    gym: '💪', spa: '🧖', ac: '❄️', bar: '🍸', kitchen: '🍽️',
    laundry: '👕', pets: '🐾', airport_shuttle: '🚌',
  };

  return (
    <AnimatedPress onPress={onPress} pressScale={0.985} style={styles.card}>
      {/* Header: ícone + nome + badge */}
      <View style={styles.cardTop}>
        <View style={styles.kindIconBox}>
          <Icon size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kindLabel}>
            {LODGING_KIND_LABELS[lodging.kind as keyof typeof LODGING_KIND_LABELS]}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {lodging.name}
          </Text>
          {/* Rating inline se existir */}
          {lodging.rating && lodging.rating > 0 && (
            <View style={styles.ratingRow}>
              {[1,2,3,4,5].map(s => (
                <Text key={s} style={{ fontSize: 11, color: s <= lodging.rating! ? '#f59e0b' : colors.border }}>★</Text>
              ))}
              <Text style={styles.ratingLabel}>
                {['','Péssimo','Ruim','Ok','Bom','Excelente'][lodging.rating]}
              </Text>
            </View>
          )}
        </View>
        <StatusBadge status={status} />
      </View>

      {/* Datas em linha compacta */}
      {(lodging.check_in_at || lodging.check_out_at) && (
        <View style={styles.dateCompact}>
          <View style={styles.dateCompactBlock}>
            <Text style={styles.dateLabel}>Check-in</Text>
            <Text style={styles.dateValue}>
              {lodging.check_in_at ? formatLodgingDateTime(lodging.check_in_at) : '—'}
            </Text>
          </View>
          <View style={styles.dateCompactArrow}>
            {nights > 0 && (
              <Text style={styles.nightsBadge}>
                {nights}n
              </Text>
            )}
            <Text style={styles.dateArrowText}>→</Text>
          </View>
          <View style={[styles.dateCompactBlock, { alignItems: 'flex-end' }]}>
            <Text style={styles.dateLabel}>Check-out</Text>
            <Text style={styles.dateValue}>
              {lodging.check_out_at ? formatLodgingDateTime(lodging.check_out_at) : '—'}
            </Text>
          </View>
        </View>
      )}

      {!lodging.check_in_at && !lodging.check_out_at && (
        <Text style={styles.undatedHint}>Sem datas definidas</Text>
      )}

      {/* Endereço */}
      {lodging.address && (
        <View style={styles.addressRow}>
          <MapPin size={12} color={colors.textMuted} />
          <Text style={styles.addressText} numberOfLines={1}>{lodging.address}</Text>
        </View>
      )}

      {/* Amenidades em chips */}
      {topAmenities.length > 0 && (
        <View style={styles.amenitiesRow}>
          {topAmenities.map((a) => (
            <View key={a} style={styles.amenityChip}>
              <Text style={styles.amenityText}>
                {AMENITY_EMOJI[a] ?? '✓'} {a}
              </Text>
            </View>
          ))}
          {amenities.length > 3 && (
            <View style={styles.amenityChip}>
              <Text style={styles.amenityText}>+{amenities.length - 3}</Text>
            </View>
          )}
        </View>
      )}

      {/* Footer: código + custo */}
      {(lodging.reservation_code || lodging.cost_amount) && (
        <View style={styles.footer}>
          {lodging.reservation_code && (
            <View style={styles.footerChip}>
              <KeyRound size={11} color={colors.textMuted} />
              <Text style={styles.footerText}>{lodging.reservation_code}</Text>
            </View>
          )}
          {lodging.cost_amount && lodging.cost_currency && (
            <View style={styles.footerChip}>
              <Wallet size={11} color={colors.textMuted} />
              <Text style={styles.footerText}>
                {lodging.cost_currency} {lodging.cost_amount.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </AnimatedPress>
  );
}

function StatusBadge({ status }: { status: LodgingStatus }) {
  const styles = useStyles();
  if (status === 'undated') return null;

  const config = {
    upcoming: { label: 'Em breve', bg: colors.surfaceAlt, fg: colors.textMuted },
    current: { label: 'Estamos aqui', bg: colors.primary, fg: colors.primaryTextOnSolid },
    past: { label: 'Concluída', bg: colors.surfaceAlt, fg: colors.textMuted },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.badgeText, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  loadingWrap: { padding: spacing.md, gap: spacing.md },
  cardSkeleton: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  emptyWrap: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyAction: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  list: {
    padding: spacing.md,
    paddingBottom: 100, // espaço pro FAB
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  kindIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: letterSpacing.tight,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  ratingLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: 3,
  },
  dateCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  dateCompactBlock: { flex: 1, gap: 2 },
  dateCompactArrow: { alignItems: 'center', gap: 2 },
  dateArrowText: { color: colors.textMuted, fontSize: 14 },
  nightsBadge: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  dateBlock: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  nightsText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  amenityChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  amenityText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  undatedHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 2,
  },
  addressText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  // FAB
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
}), [themeVersion]);
}
