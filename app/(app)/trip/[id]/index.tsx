import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPress } from '@/components/AnimatedPress';
import { AvatarStack } from '@/components/Avatar';
import { Calendar, ChevronRight, Copy, Edit, ListChecks, MapPin, Backpack, MoreHorizontal, Share, Sparkles, Wallet } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { ActionSheet } from '@/components/ActionSheet';
import { ShareTripModal } from '@/components/trip/ShareTripModal';
import { ItineraryTab } from '@/components/trip/ItineraryTab';
import { ManageMembersModal } from '@/components/trip/ManageMembersModal';
import { PlacesTab } from '@/components/trip/PlacesTab';
import { ExpensesTab } from '@/components/trip/ExpensesTab';
import { LodgingsTab } from '@/components/trip/LodgingsTab';
import { TasksTab } from '@/components/trip/TasksTab';
import { DocumentsTab } from '@/components/trip/DocumentsTab';
import { TransportsTab } from '@/components/trip/TransportsTab';
import { TripStatsRow, MembersBadge, AnimatedTabs } from '@/components/trip/TripSubComponents';
import { useHasPendingBalance } from '@/hooks/useHasPendingBalance';
import { useAuth } from '@/hooks/useAuth';
import { useTripMembers } from '@/hooks/useTripMembers';
import { useTripStats } from '@/hooks/useTripStats';
import { useUnreadNotifications, markNotificationsRead } from '@/hooks/useUnreadNotifications';
import { formatDateRangeBR, formatDateShortBR, getTripStatus } from '@/lib/dates';
import { formatCurrency } from '@/lib/expenses';
import { exportTripAsPDF } from '@/lib/exportTrip';
import { AddToCalendarModal } from '@/components/AddToCalendarModal';
import { PackingListModal } from '@/components/trip/PackingListModal';
import { TripAssistantModal } from '@/components/trip/TripAssistantModal';
import { duplicateTrip } from '@/lib/duplicateTrip';
import { supabase, type Trip } from '@/lib/supabase';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';

type TabKey = 'itinerary' | 'lodging' | 'places' | 'expenses' | 'tasks' | 'documents' | 'transports';

type TabDef = { key: TabKey; label: string; badge?: boolean };

/** Constrói lista de tabs respeitando as features ativadas na viagem. */
function getEnabledTabs(trip: Trip | null): TabDef[] {
  if (!trip) return [];
  const all: { key: TabKey; label: string; enabled: boolean }[] = [
    { key: 'itinerary', label: 'Roteiro',    enabled: trip.feature_itinerary !== false },
    { key: 'lodging',   label: 'Hospedagem', enabled: trip.feature_lodging !== false },
    { key: 'expenses',  label: 'Despesas',   enabled: trip.feature_expenses !== false },
    { key: 'tasks',     label: 'Tarefas',    enabled: trip.feature_tasks !== false },
    { key: 'places',    label: 'Lugares',    enabled: trip.feature_places !== false },
    { key: 'documents',  label: 'Docs',       enabled: true },
    { key: 'transports', label: 'Transporte',  enabled: true },
  ];
  return all.filter((t) => t.enabled).map(({ key, label }) => ({ key, label }));
}

export default function TripDetailScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('itinerary');
  const [membersOpen, setMembersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [packingOpen, setPackingOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const unreadCount = useUnreadNotifications(typeof id === 'string' ? id : undefined);

  // Marca notificações como lidas ao entrar na viagem
  useEffect(() => {
    if (user?.id && typeof id === 'string') {
      markNotificationsRead(user.id, id).catch(() => {});
    }
  }, [user?.id, id]);
  const [duplicating, setDuplicating] = useState(false);

  async function handleDuplicate() {
    if (!trip || !user) return;
    Alert.alert(
      'Duplicar viagem',
      `Vai criar uma cópia de "${trip.title}" com o mesmo roteiro, hospedagens e tarefas (sem as datas).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Duplicar',
          onPress: async () => {
            setDuplicating(true);
            try {
              const newId = await duplicateTrip(trip.id, user.id);
              if (newId) {
                toast.success('Viagem duplicada!');
                router.push(`/(app)/trip/${newId}` as any);
              } else {
                toast.error('Erro ao duplicar viagem.');
              }
            } finally {
              setDuplicating(false);
            }
          },
        },
      ],
    );
  }

  /**
   * Abre menu de compartilhamento. Action sheet com 2 opções:
   * - Exportar PDF (gera arquivo e abre share sheet nativo)
   * - Link público (abre modal pra gerar/gerenciar links)
   */
  function handleSharePress() {
    if (!trip) return;
    Alert.alert('Compartilhar viagem', 'Como você quer compartilhar?', [
      {
        text: 'Exportar PDF',
        onPress: handleExport,
      },
      {
        text: 'Link público',
        onPress: () => setShareModalOpen(true),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  /**
   * Exporta a viagem como PDF e abre o menu de compartilhar nativo.
   * Carrega TODOS os dados (dias, roteiro, hospedagens, despesas, tarefas, membros)
   * em paralelo, gera o HTML/PDF, e dispara o share sheet.
   */
  async function handleExport() {
    if (!trip || exporting) return;
    setExporting(true);
    try {
      await exportTripAsPDF(trip);
    } catch (err: any) {
      console.warn('[export] erro:', err);
      toast.error(err?.message ?? 'Erro ao gerar PDF.');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    async function fetchTrip() {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single();

      if (!mounted) return;
      if (error) console.error(error);
      else setTrip(data);
      setLoading(false);
    }

    fetchTrip();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (trip) {
      navigation.setOptions({
        title: unreadCount > 0 ? `${trip.title}  🔴` : trip.title,
        headerRight: () => (
          <View style={styles.headerRightRow}>
            {/* IA — sempre visível */}
            <AnimatedPress
              onPress={() => setAssistantOpen(true)}
              pressScale={0.9}
              style={styles.headerIconBtn}
            >
              <Sparkles size={18} color={colors.primary} />
            </AnimatedPress>

            {/* Mala — sempre visível */}
            <AnimatedPress
              onPress={() => setPackingOpen(true)}
              pressScale={0.9}
              style={styles.headerIconBtn}
            >
              <Backpack size={18} color={colors.text} />
            </AnimatedPress>

            {/* Editar — sempre visível */}
            <AnimatedPress
              onPress={() => router.push(`/(app)/trip/${trip.id}/edit`)}
              pressScale={0.9}
              style={styles.headerIconBtn}
            >
              <Edit size={18} color={colors.text} />
            </AnimatedPress>

            {/* Mais opções */}
            <AnimatedPress
              onPress={() => setMoreMenuOpen(true)}
              pressScale={0.9}
              style={styles.headerIconBtn}
            >
              <MoreHorizontal size={18} color={colors.text} />
            </AnimatedPress>
          </View>
        ),
      });
    }
  }, [trip, navigation, router, exporting, duplicating, unreadCount]);

  // Calcula tabs habilitadas — funciona mesmo com trip null (retorna vazio).
  // useMemo pra evitar referência nova a cada render (causaria loop no useEffect abaixo).
  const enabledTabsRaw = useMemo(() => getEnabledTabs(trip), [trip]);

  // Verifica se há saldo pendente nessa viagem (mostra dot vermelho na tab Despesas)
  const hasPendingBalance = useHasPendingBalance(trip?.id ?? null);

  // Aplica badge nas tabs (apenas Despesas por enquanto)
  const enabledTabs = useMemo(
    () =>
      (enabledTabsRaw ?? []).map((t) => ({
        ...t,
        badge: t.key === 'expenses' && hasPendingBalance,
      })),
    [enabledTabsRaw, hasPendingBalance]
  );

  // Se a aba ativa foi desativada (mudança de features), cai na primeira disponível.
  // ESTE useEffect PRECISA estar ANTES dos early returns pra não violar a regra
  // dos hooks (mesmo número e ordem em todo render).
  useEffect(() => {
    if (
      enabledTabs.length > 0 &&
      !enabledTabs.find((t) => t.key === activeTab)
    ) {
      setActiveTab(enabledTabs[0].key);
    }
  }, [enabledTabs, activeTab]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.hero}>
          <Skeleton height={14} width="35%" />
          <Skeleton height={20} width="65%" style={{ marginTop: spacing.xs }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Viagem não encontrada.</Text>
      </View>
    );
  }

  const { status, countdownLabel } = getTripStatus(trip.start_date, trip.end_date);

  // Datas no formato dd/mm compacto
  const startFmt = trip.start_date ? formatDateShortBR(trip.start_date) : null;
  const endFmt   = trip.end_date   ? formatDateShortBR(trip.end_date)   : null;
  const days = trip.start_date && trip.end_date
    ? Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000) + 1
    : null;

  return (
    <ErrorBoundary fallbackLabel="Erro ao carregar a viagem">
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroInfo}>
            {/* Linha de data compacta: 14/06 – 22/06 · 9d */}
            {(startFmt || endFmt) && (
              <View style={styles.dateRow}>
                <Text style={styles.dateText}>
                  {startFmt && endFmt
                    ? `${startFmt} – ${endFmt}`
                    : startFmt ?? endFmt}
                  {days ? `  ·  ${days}d` : ''}
                </Text>
                {countdownLabel && (
                  <View style={[
                    styles.countdownBadge,
                    status === 'ongoing' && styles.countdownOngoing,
                    status === 'past' && styles.countdownPast,
                  ]}>
                    <Text style={[
                      styles.countdownText,
                      status === 'ongoing' && styles.countdownTextOngoing,
                      status === 'past' && styles.countdownTextPast,
                    ]}>
                      {countdownLabel}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {!trip.start_date && (
              <Text style={styles.dateCardNoDate}>Datas não definidas</Text>
            )}
            {trip.description ? (
              <Text style={styles.description} numberOfLines={1}>
                {trip.description}
              </Text>
            ) : null}
          </View>
          <MembersBadge tripId={trip.id} onPress={() => setMembersOpen(true)} />
        </View>
        <TripStatsRow trip={trip} onTabChange={(tab) => setActiveTab(tab as any)} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={styles.tabsContent}
      >
        <AnimatedTabs
          tabs={enabledTabs}
          activeKey={activeTab}
          onSelect={setActiveTab}
        />
      </ScrollView>

      <View style={styles.tabContent}>
        {activeTab === 'itinerary' && <ItineraryTab trip={trip} />}
        {activeTab === 'lodging' && <LodgingsTab trip={trip} />}
        {activeTab === 'places' && <PlacesTab trip={trip} />}
        {activeTab === 'expenses' && <ExpensesTab trip={trip} />}
        {activeTab === 'tasks' && <TasksTab trip={trip} />}
        {activeTab === 'documents' && <DocumentsTab trip={trip} />}
        {activeTab === 'transports' && <TransportsTab trip={trip} />}
      </View>

      <ManageMembersModal
        trip={trip}
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
      />

      <ShareTripModal
        trip={trip}
        visible={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />

      <AddToCalendarModal
        trip={trip}
        visible={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
      />

      {packingOpen && (
        <PackingListModal
          visible={packingOpen}
          onClose={() => setPackingOpen(false)}
          tripId={trip.id}
          destination={trip.title}
          daysCount={trip.start_date && trip.end_date
            ? Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000) + 1
            : 7}
          startDate={trip.start_date ?? null}
        />
      )}

      {assistantOpen && (
        <TripAssistantModal
          visible={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          tripId={trip.id}
          tripTitle={trip.title}
        />
      )}

      {/* Menu de mais opções */}
      <ActionSheet
        visible={moreMenuOpen}
        title={trip.title}
        onClose={() => setMoreMenuOpen(false)}
        options={[
          { icon: '📅', label: 'Exportar para calendário', onPress: () => setCalendarModalOpen(true) },
          { icon: '💰', label: 'Plano de poupança', onPress: () => router.push(`/(app)/trip/${trip.id}/savings-plan` as any) },
          { icon: '📤', label: 'Compartilhar viagem', onPress: handleSharePress },
          { icon: '📋', label: 'Duplicar viagem', onPress: handleDuplicate },
        ]}
      />
    </SafeAreaView>
    </ErrorBoundary>
  );
}


function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.textMuted, fontSize: fontSize.md },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySofter,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroInfo: { flex: 1 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'nowrap',
  },
  dateText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dateCardNoDate: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  dateRange: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  countdownBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  countdownOngoing: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success + '30',
  },
  countdownPast: {
    backgroundColor: colors.surfaceAlt,
    borderColor: 'transparent',
  },
  countdownText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  countdownTextOngoing: { color: colors.success },
  countdownTextPast: { color: colors.textMuted },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: 3,
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    paddingRight: spacing.sm,
  },
  pressedDim: { opacity: 0.7 },
  tabsRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabsContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  tabsInner: {
    flexDirection: 'row',
    gap: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '700',
  },
  tabLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  tabContent: { flex: 1 },
  headerRightRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginRight: spacing.md,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
}), [themeVersion]);
}
