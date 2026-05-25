import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { ActionSheet } from '@/components/ActionSheet';
import { AIConsentModal, hasAIConsent, grantAIConsent } from '@/components/AIConsentModal';
import { Compass, Copy, Filter, Plus, Search, SlidersHorizontal } from '@/components/Icon';
import { NewTripChoiceModal } from '@/components/NewTripChoiceModal';
import { PulseDot } from '@/components/PulseDot';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { formatDateRangeBR, getTripStatus } from '@/lib/dates';
import { useCoverPhoto } from '@/hooks/useCoverPhoto';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase, type Trip } from '@/lib/supabase';
import { duplicateTrip } from '@/lib/duplicateTrip';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

// DraggableFlatList só carrega em native (web não suporta react-native-reanimated
// usado pela lib). Em web, caímos no FlatList comum sem reordenação.
let DraggableFlatList: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DraggableFlatList = require('react-native-draggable-flatlist').default;
}

export default function HomeScreen() {
  const styles = useStyles();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [showAIConsent, setShowAIConsent] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'upcoming' | 'ongoing' | 'past' | 'planning'>('all');

  async function handleTripAction(trip: Trip, action: 'duplicate' | 'archive' | 'delete') {
    if (action === 'duplicate') {
      if (!user) return;
      try {
        const newId = await duplicateTrip(trip.id, user.id);
        if (newId) fetchTrips();
      } catch { /* silencioso */ }
    } else if (action === 'archive') {
      await supabase.from('trips').update({ is_archived: true } as any).eq('id', trip.id);
      fetchTrips();
    } else if (action === 'delete') {
      await supabase.rpc('delete_trip', { _trip_id: trip.id });
      fetchTrips();
    }
  }

  // Mostra consentimento de IA logo na primeira vez
  useEffect(() => {
    hasAIConsent().then((has) => { if (!has) setShowAIConsent(true); });
  }, []);
  const [showSearch, setShowSearch] = useState(false);
  const [globalStats, setGlobalStats] = useState<{ trips: number; countries: number; cities: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      const { data } = await supabase
        .from('trips')
        .select('destination_city, destination_country')
        .order('created_at');
      if (!data) return;
      const countries = new Set(data.map((t: any) => t.destination_country).filter(Boolean));
      const cities = new Set(data.map((t: any) => t.destination_city).filter(Boolean));
      setGlobalStats({ trips: data.length, countries: countries.size, cities: cities.size });
    }
    loadStats();
  }, [user]);

  const fetchTrips = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      // display_order primeiro (manual), depois data (automática) como fallback
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    setTrips(data ?? []);
    setLoading(false);
  }, []);

  /**
   * Persiste a nova ordem após drag-and-drop.
   * Atribuímos display_order = índice * 1000 (espaçamento permite inserções
   * sem reorder de tudo no futuro).
   */
  async function handleReorder(reorderedTrips: Trip[]) {
    // Atualização otimista da UI primeiro
    setTrips(reorderedTrips);

    // Persiste no banco (best-effort — se falhar, dá refresh pra reverter)
    const updates = reorderedTrips.map((trip, idx) =>
      supabase
        .from('trips')
        .update({ display_order: idx * 1000 })
        .eq('id', trip.id),
    );

    const results = await Promise.all(updates);
    const anyError = results.find((r) => r.error);
    if (anyError?.error) {
      console.warn('Erro ao reordenar:', anyError.error);
      // Recarrega pra UI bater com o banco
      fetchTrips();
    }
  }

  const refreshProps = usePullToRefresh(fetchTrips);

  // Filtragem + busca
  const filteredTrips = useMemo(() => {
    let result = trips;
    // Busca por texto
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
      );
    }
    // Filtro por status
    if (activeFilter !== 'all') {
      result = result.filter((t) => {
        const { status } = getTripStatus(t.start_date, t.end_date);
        return status === activeFilter;
      });
    }
    return result;
  }, [trips, searchText, activeFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
    }, [fetchTrips])
  );

  useRealtimeTable({
    table: 'trip_members',
    filter: user ? `profile_id=eq.${user.id}` : undefined,
    onChange: fetchTrips,
    enabled: !!user,
  });

  // Avatar como botão no header (abre Configurações)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: '',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: spacing.sm }}>
          <AnimatedPress
            onPress={() => setShowSearch((v) => !v)}
            pressScale={0.9}
            style={styles.headerIconBtn}
          >
            <Search size={18} color={colors.text} />
          </AnimatedPress>
          <AnimatedPress
            onPress={() => router.push('/(app)/settings')}
            pressScale={0.9}
            style={styles.headerAvatar}
          >
            <Avatar
              url={profile?.avatar_url}
              name={profile?.full_name}
              email={profile?.email}
              size={32}
            />
          </AnimatedPress>
        </View>
      ),
    });
  }, [navigation, profile, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.list}>
          <View style={styles.greeting}>
            <Skeleton height={16} width="40%" />
            <View style={{ height: 6 }} />
            <Skeleton height={28} width="60%" />
          </View>
          <TripCardSkeleton />
          <TripCardSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {Platform.OS === 'web' || !DraggableFlatList ? (
        <FlatList
          data={filteredTrips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            trips.length === 0 && styles.listEmpty,
          ]}
          refreshControl={<RefreshControl {...refreshProps} />}
          ListHeaderComponent={
            trips.length > 0 ? (
              <TripListHeader
                globalStats={globalStats}
                tripCount={trips.length}
                filteredCount={filteredTrips.length}
                profile={profile}
                showSearch={showSearch}
                searchText={searchText}
                onSearchChange={setSearchText}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
              />
            ) : null
          }
          ListEmptyComponent={
            searchText || activeFilter !== 'all' ? (
              <View style={styles.emptyFilter}>
                <Text style={styles.emptyFilterText}>
                  Nenhuma viagem encontrada{searchText ? ` para "${searchText}"` : ''}.
                </Text>
                <Pressable onPress={() => { setSearchText(''); setActiveFilter('all'); }}>
                  <Text style={styles.emptyFilterClear}>Limpar filtros</Text>
                </Pressable>
              </View>
            ) : (
            <EmptyState
              icon={<Compass size={36} color={colors.primary} />}
              title="Sua próxima aventura começa aqui"
              description="Roteiro, hospedagem, despesas e grupo — tudo num só lugar. Crie sua primeira viagem."
              action={{
                label: '+ Criar viagem',
                onPress: () => setChoiceOpen(true),
              }}
            />
            )
          }
          renderItem={({ item, index }) => (
            <FadeInView delay={getStaggerDelay(index)}>
              <TripCard trip={item} onAction={(action) => handleTripAction(item, action)} />
            </FadeInView>
          )}
        />
      ) : (
        <DraggableFlatList
          data={filteredTrips}
          keyExtractor={(item: Trip) => item.id}
          contentContainerStyle={[
            styles.list,
            trips.length === 0 && styles.listEmpty,
          ]}
          refreshControl={<RefreshControl {...refreshProps} />}
          activationDistance={20}
          onDragEnd={({ data }: { data: Trip[] }) => handleReorder(data)}
          ListHeaderComponent={
            trips.length > 0 ? (
              <TripListHeader
                globalStats={globalStats}
                tripCount={trips.length}
                filteredCount={filteredTrips.length}
                profile={profile}
                showSearch={showSearch}
                searchText={searchText}
                onSearchChange={setSearchText}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
              />
            ) : null
          }
          ListEmptyComponent={
            searchText || activeFilter !== 'all' ? (
              <View style={styles.emptyFilter}>
                <Text style={styles.emptyFilterText}>
                  Nenhuma viagem encontrada{searchText ? ` para "${searchText}"` : ''}.
                </Text>
                <Pressable onPress={() => { setSearchText(''); setActiveFilter('all'); }}>
                  <Text style={styles.emptyFilterClear}>Limpar filtros</Text>
                </Pressable>
              </View>
            ) : (
            <EmptyState
              icon={<Compass size={36} color={colors.primary} />}
              title="Sua próxima aventura começa aqui"
              description="Roteiro, hospedagem, despesas e grupo — tudo num só lugar. Crie sua primeira viagem."
              action={{
                label: '+ Criar viagem',
                onPress: () => setChoiceOpen(true),
              }}
            />
            )
          }
          renderItem={({
            item,
            drag,
            isActive,
          }: {
            item: Trip;
            drag: () => void;
            isActive: boolean;
          }) => (
            <TripCard trip={item} onLongPress={drag} isActive={isActive} onAction={(action) => handleTripAction(item, action)} />
          )}
        />
      )}

      {trips.length > 0 && (
        <PulseFab onPress={() => setChoiceOpen(true)} />
      )}

      <NewTripChoiceModal
        visible={choiceOpen}
        onClose={() => setChoiceOpen(false)}
      />


      <AIConsentModal
        visible={showAIConsent}
        onAccept={async () => { await grantAIConsent(); setShowAIConsent(false); }}
        onDecline={() => setShowAIConsent(false)}
      />
    </SafeAreaView>
  );
}

/**
 * FAB que entra com pulse: aparece em escala 0, vai pra 1.1 com bounce, assenta em 1.
 * Sinaliza "ei, sou interativo" sem ser irritante.
 */
// ── TripListHeader ────────────────────────────────────────────────
type FilterKey = 'all' | 'upcoming' | 'ongoing' | 'past' | 'planning';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'ongoing', label: 'Em andamento' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'past', label: 'Passadas' },
  { key: 'planning', label: 'Planejando' },
];

function TripListHeader({
  tripCount, filteredCount, profile, showSearch,
  searchText, onSearchChange, activeFilter, onFilterChange, globalStats,
}: {
  tripCount: number;
  filteredCount: number;
  profile: any;
  showSearch: boolean;
  searchText: string;
  onSearchChange: (v: string) => void;
  activeFilter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  globalStats: { trips: number; countries: number; cities: number } | null;
}) {
  const styles = useStyles();
  return (
    <FadeInView>
      <OfflineBanner />

      {/* Stats globais */}
      {globalStats && globalStats.trips > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statEmoji}>🗺️</Text>
            <Text style={styles.statNum}>{globalStats.trips}</Text>
            <Text style={styles.statLabel}>{globalStats.trips === 1 ? 'viagem' : 'viagens'}</Text>
          </View>
          {globalStats.countries > 0 && (
            <View style={styles.statPill}>
              <Text style={styles.statEmoji}>🌍</Text>
              <Text style={styles.statNum}>{globalStats.countries}</Text>
              <Text style={styles.statLabel}>{globalStats.countries === 1 ? 'país' : 'países'}</Text>
            </View>
          )}
          {globalStats.cities > 0 && (
            <View style={styles.statPill}>
              <Text style={styles.statEmoji}>🏙️</Text>
              <Text style={styles.statNum}>{globalStats.cities}</Text>
              <Text style={styles.statLabel}>{globalStats.cities === 1 ? 'cidade' : 'cidades'}</Text>
            </View>
          )}
        </View>
      )}

      {/* Saudação */}
      <View style={styles.greeting}>
        <Text style={styles.greetingHi}>{getGreeting()},</Text>
        <Text style={styles.greetingName} numberOfLines={1}>
          {profile?.full_name?.split(' ')[0] ?? 'viajante'} 👋
        </Text>
        <Text style={styles.greetingHint}>
          {tripCount === 1 ? 'Sua viagem está esperando.' : `${tripCount} ${tripCount === 1 ? 'viagem' : 'viagens'} planejada${tripCount !== 1 ? 's' : ''}.`}
        </Text>
      </View>

      {/* Barra de busca — aparece quando showSearch=true */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={searchText}
            onChangeText={onSearchChange}
            placeholder="Buscar viagem..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {/* Filtros — flex wrap, sem scroll, sem emojis */}
      <View style={styles.filtersRow}>
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => onFilterChange(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Contador quando filtrado */}
      {(activeFilter !== 'all' || searchText) && (
        <Text style={styles.filterCount}>
          {filteredCount} {filteredCount === 1 ? 'viagem' : 'viagens'} encontrada{filteredCount !== 1 ? 's' : ''}
        </Text>
      )}
    </FadeInView>
  );
}

function PulseFab({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200 });
    // Spring chega levemente passando de 1 (overshoot) e assenta
    scale.value = withDelay(
      120,
      withSpring(1, {
        damping: 10,
        stiffness: 180,
        mass: 0.8,
      })
    );
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fabWrap, animatedStyle]}>
      <AnimatedPress style={styles.fab} onPress={onPress} pressScale={0.9}>
        <Plus size={28} color={colors.primaryTextOnSolid} strokeWidth={2.5} />
      </AnimatedPress>
    </Animated.View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function TripCardSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.coverWrap}>
        <Skeleton height={180} width="100%" borderRadius={0} />
      </View>
    </View>
  );
}

function TripCard({
  trip,
  onLongPress,
  isActive,
  onAction,
}: {
  trip: Trip;
  onLongPress?: () => void;
  isActive?: boolean;
  onAction?: (action: 'duplicate' | 'archive' | 'delete') => void;
}) {
  const styles = useStyles();
  const router = useRouter();
  const dateRange = formatDateRangeBR(trip.start_date, trip.end_date);
  const { status, countdownLabel } = getTripStatus(trip.start_date, trip.end_date);
  const coverUrl = useCoverPhoto(trip.title, trip.cover_image_url);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unreadCount = useUnreadNotifications(trip.id);
  const swipeableRef = useRef<any>(null);

  const scale = useSharedValue(1);
  const overlayOpacity = useSharedValue(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  function handlePress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    scale.value = withTiming(0.96, { duration: 80 });
    overlayOpacity.value = withTiming(0.15, { duration: 80 });
    pressTimer.current = setTimeout(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      overlayOpacity.value = withTiming(0, { duration: 200 });
      router.push(`/(app)/trip/${trip.id}`);
    }, 100);
  }

  function handleLongPress() {
    if (onLongPress) onLongPress();
  }

  function closeSwipe() {
    swipeableRef.current?.close();
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActionsRight}>
        <Pressable
          style={[styles.swipeAction, styles.swipeActionArchive]}
          onPress={() => { closeSwipe(); setTimeout(() => onAction?.('archive'), 150); }}
        >
          <Text style={styles.swipeActionIcon}>🗂️</Text>
          <Text style={styles.swipeActionLabel}>Arquivar</Text>
        </Pressable>
        <Pressable
          style={[styles.swipeAction, styles.swipeActionDelete]}
          onPress={() => { closeSwipe(); setTimeout(() => setConfirmDelete(true), 150); }}
        >
          <Text style={styles.swipeActionIcon}>🗑️</Text>
          <Text style={styles.swipeActionLabel}>Excluir</Text>
        </Pressable>
      </View>
    );
  }

  function renderLeftActions() {
    return (
      <View style={styles.swipeActionsLeft}>
        <Pressable
          style={[styles.swipeAction, styles.swipeActionDuplicate]}
          onPress={() => { closeSwipe(); setTimeout(() => onAction?.('duplicate'), 150); }}
        >
          <Text style={styles.swipeActionIcon}>📋</Text>
          <Text style={styles.swipeActionLabel}>Duplicar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      friction={2}
      overshootFriction={8}
      rightThreshold={60}
      leftThreshold={60}
      containerStyle={{ borderRadius: 20 }}
    >
    <Animated.View style={[styles.card, isActive && styles.cardDragging, animatedStyle]}>
      <AnimatedPress
        pressScale={1}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={{ flex: 1 }}
      >
      {/* COVER PHOTO area (top half) */}
      <View style={styles.coverWrap}>
        {coverUrl && (
          <Image
            source={{ uri: coverUrl }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        )}
        {/* Gradient overlay pra texto/badge ficarem legíveis.
            Usa preto puro (não a cor do tema) porque a imagem é o fundo —
            tem que funcionar em qualquer paleta. Topo só 5% pra não escurecer
            demais; rodapé bem opaco pra legibilidade do título. */}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        />

        {/* Countdown badge no canto superior direito.
            Quando ongoing, adiciona PulseDot pra dar feedback visual de "ao vivo". */}
        {countdownLabel && (
          <View
            style={[
              styles.countdownBadge,
              status === 'ongoing' && styles.countdownOngoing,
              status === 'past' && styles.countdownPast,
            ]}
          >
            {status === 'ongoing' && (
              <PulseDot size={6} color="#ffffff" />
            )}
            <Text
              style={[
                styles.countdownText,
                status === 'ongoing' && styles.countdownTextOngoing,
                status === 'past' && styles.countdownTextPast,
              ]}
            >

        
              {countdownLabel}
            </Text>
          </View>
        )}

        {/* Title + date overlay no rodapé da cover */}
        <View style={styles.coverContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>
              {trip.title}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
          {!!dateRange && <Text style={styles.cardSubtitleHero}>{dateRange}</Text>}
        </View>
      </View>

      {/* Description (se houver) embaixo, em fundo de surface */}
      {trip.description && (
        <View style={styles.cardFooter}>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {trip.description}
          </Text>
        </View>
      )}

      {/* Barra de progresso para viagens em andamento */}
      {status === 'ongoing' && trip.start_date && trip.end_date && (() => {
        const start = new Date(trip.start_date).getTime();
        const end = new Date(trip.end_date).getTime();
        const now = Date.now();
        const progress = Math.max(0, Math.min(1, (now - start) / (end - start)));
        const totalDays = Math.round((end - start) / 86400000) + 1;
        const currentDay = Math.min(Math.floor((now - start) / 86400000) + 1, totalDays);
        return (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>
              Dia {currentDay} de {totalDays}
            </Text>
          </View>
        );
      })()}
      </AnimatedPress>

      {/* Overlay de flash ao tocar */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#fff', borderRadius: 20 }, overlayStyle]}
      />

      {/* ActionSheet removido — ações via swipe lateral */}
      <ActionSheet
        visible={confirmDelete}
        title="Excluir viagem?"
        subtitle={`"${trip.title}" será removida permanentemente.`}
        onClose={() => setConfirmDelete(false)}
        options={[
          {
            icon: '🗑️',
            label: 'Excluir permanentemente',
            destructive: true,
            onPress: () => onAction?.('delete'),
          },
        ]}
      />
    </Animated.View>
    </Swipeable>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  statEmoji: { fontSize: 13 },
  statNum: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  safe: { flex: 1, backgroundColor: colors.bg },
  list: {
    padding: spacing.lg,
    gap: spacing.lg, // antes: md (12) — agora lg (16) pra mais respiro entre cards
    flexGrow: 1,
  },
  listEmpty: {
    justifyContent: 'center',
  },
  greeting: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl, // mais separação antes dos cards
  },
  greetingHi: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  greetingName: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tighter,
    marginTop: 6,
    lineHeight: 38,
  },
  greetingHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.md,
  },
  cardDragging: {
    opacity: 0.88,
    transform: [{ scale: 1.03 }],
    borderColor: colors.primary,
    borderWidth: 2,
  },
  coverWrap: {
    height: 220,
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  cardFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  notifBadge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tighter,
    marginBottom: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardSubtitleHero: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: fontSize.sm,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  countdownBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(123,47,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    shadowColor: 'rgba(123,47,255,0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  countdownOngoing: {
    backgroundColor: 'rgba(16,185,129,0.92)',
    shadowColor: 'rgba(16,185,129,0.5)',
  },
  countdownPast: {
    backgroundColor: 'rgba(100,116,139,0.88)',
    shadowColor: 'transparent',
  },
  countdownText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
  },
  countdownTextOngoing: { color: '#ffffff' },
  countdownTextPast: { color: '#ffffff' },
  cardDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  headerIconBtn: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterEmoji: { fontSize: 13 },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  filterLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filterCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },
  emptyFilter: {
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyFilterText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  emptyFilterClear: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  headerAvatar: {
    marginRight: spacing.md,
  },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.primaryGlow,
  },
  swipeActionsRight: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: spacing.sm,
  },
  swipeActionsLeft: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginRight: spacing.sm,
  },
  swipeAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 16,
    marginHorizontal: 2,
  },
  swipeActionDuplicate: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  swipeActionArchive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swipeActionDelete: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  swipeActionIcon: { fontSize: 20 },
  swipeActionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
}), [themeVersion]);
}
