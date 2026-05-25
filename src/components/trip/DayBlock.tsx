import {useEffect, useState, useMemo } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  fetchWeatherForLocation,
  getWeatherForDate,
  getWeatherAlerts,
  weatherCodeToIcon,
  weatherCodeToLabel,
  isDangerousWeather,
  type WeatherDay,
} from '@/lib/weather';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { ChevronRight, KeyRound, LogOut, Navigation, Plus, Route, Sparkles } from '@/components/Icon';
import { LODGING_KIND_ICONS } from '@/components/lodgingIcons';
import { useToast } from '@/components/Toast';
import { SafetyAnalysisModal } from '@/components/trip/SafetyAnalysisModal';
import { reorderItineraryItems } from '@/lib/itinerary';
import { formatDateLongBR } from '@/lib/dates';
import type { DayLodgingEvents, Lodging, LodgingKind } from '@/lib/lodgings';
import { extractRoutePoints, openRouteInMaps } from '@/lib/mapsLink';
import {
  recomputeStartTimes,
  sortByProximity,
  totalDistanceKm,
} from '@/lib/proximityOptimizer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { getUserSafetyPrefs } from '@/lib/safetyAnalyzer';
import { DEFAULT_SAFETY_PREFS } from '@/hooks/useSafetyPrefs';
import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';

import { ItineraryRow } from './ItineraryRow';
import { FlightRow } from './FlightRow';
import type { ItineraryItem } from './types';
import { useTheme } from '@/components/ThemeProvider';

let DraggableFlatList: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DraggableFlatList = require('react-native-draggable-flatlist').default;
}

type Props = {
  tripId: string;
  dayDate: string;
  dayNumber: number;
  items: ItineraryItem[];
  lodgingEvents?: DayLodgingEvents;
  onAddPlace: () => void;
  onSuggestMore: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string) => void;
  onOpenDay: () => void;
  onReordered: () => void;
  onEditItem?: (item: ItineraryItem) => void;
};

/** Detecta se um item do roteiro é um voo importado (sem place_id e com título de voo) */
function isFlightItem(item: ItineraryItem): boolean {
  if (item.place?.id) return false; // tem lugar real → não é voo
  const title = (item.custom_title ?? '').toLowerCase();
  return (
    (title ?? '').includes('✈') ||
    (title ?? '').includes('voo') ||
    (title ?? '').includes('flight') ||
    (title ?? '').includes('→') && ((title ?? '').includes('gol') || (title ?? '').includes('tam') || (title ?? '').includes('azul') || (title ?? '').includes('latam'))
  );
}

export function DayBlock({
  tripId,
  dayDate,
  dayNumber,
  items: initialItems,
  lodgingEvents,
  onAddPlace,
  onSuggestMore,
  onRemoveItem,
  onMoveItem,
  onOpenDay,
  onReordered,
  onEditItem,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [optimizing, setOptimizing] = useState(false);
  const [safetyItem, setSafetyItem] = useState<ItineraryItem | null>(null);
  const [safetyAlertIds, setSafetyAlertIds] = useState<Set<string>>(new Set());
  const [safetyAlertMap, setSafetyAlertMap] = useState<Map<string, { alert_type: string; description: string; severity: number }[]>>(new Map());
  const [weatherData, setWeatherData] = useState<WeatherDay | null>(null);
  const [weatherSevere, setWeatherSevere] = useState(false);

  // Carrega alertas de segurança filtrados pelas preferências do usuário
  useEffect(() => {
    async function loadAlerts() {
      const prefs = user?.id ? await getUserSafetyPrefs(user.id) : DEFAULT_SAFETY_PREFS;
      const placeEntries = initialItems
        .map((it) => ({ id: it.place?.id, name: it.place?.name }))
        .filter((p): p is { id: string; name: string } => !!p.id);

      if (placeEntries.length === 0) return;

      const alertIds = new Set<string>();
      const alertMap = new Map<string, { alert_type: string; description: string; severity: number }[]>();

      await Promise.all(placeEntries.map(async ({ id, name }) => {
        const { data } = await (supabase as any)
          .from('place_safety_alerts')
          .select('alert_type, description, severity')
          .or(`place_id.eq.${id},place_name.ilike.%${name.slice(0, 20)}%`)
          .gte('severity', 2)
          .order('severity', { ascending: false });

        if (!data?.length) return;
        const filtered = data.filter((a: any) => prefs[a.alert_type as keyof typeof prefs] === true);
        if (filtered.length === 0) return;
        alertIds.add(id);
        alertMap.set(id, filtered);
      }));

      setSafetyAlertIds(alertIds);
      setSafetyAlertMap(alertMap);
    }
    loadAlerts().catch(() => {});
  }, [initialItems, user?.id]);

  // Carrega previsão do tempo para cada local individualmente
  useEffect(() => {
    const firstWithCoord = initialItems.find(
      (it) => it.place?.latitude != null && it.place?.longitude != null
    );
    if (!firstWithCoord?.place || !dayDate) return;

    fetchWeatherForLocation(
      firstWithCoord.place.latitude!,
      firstWithCoord.place.longitude!,
    ).then((days) => {
      const dayWeather = getWeatherForDate(days, dayDate);
      if (!dayWeather) return;
      setWeatherData(dayWeather);
      const alerts = getWeatherAlerts(dayWeather);
      const hasDanger = alerts.some((a) => a.severity === 'danger');
      setWeatherSevere(hasDanger);

      // Push de alerta climático para todos os membros da viagem
      if (hasDanger && user?.id && tripId) {
        const worstAlert = alerts.find((a) => a.severity === 'danger');
        if (worstAlert) {
          // Controle via chave única por dia+viagem para não spammar
          const alertKey = `weather_alert_sent:${tripId}:${dayDate}`;
          (async () => {
            try {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              const alreadySent = await AsyncStorage.getItem(alertKey).catch(() => null);
              if (!alreadySent) {
                await AsyncStorage.setItem(alertKey, '1').catch(() => {});
                const { sendPushToTripMembers } = await import('@/lib/sendPush');
                sendPushToTripMembers({
                  tripId,
                  excludeProfileId: '',
                  title: '🌩️ Alerta de clima na viagem',
                  body: worstAlert.message.replace(/^[^\s]+\s/, ''),
                  data: { type: 'weather_alert', tripId, date: dayDate },
                }).catch(() => {});
              }
            } catch {}
          })();
        }
      }
    }).catch(() => {});
  }, [initialItems, dayDate, user?.id, tripId]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function persistOrder(newOrder: ItineraryItem[]) {
    const ids = newOrder.map((it) => it.id);
    const { error } = await reorderItineraryItems(ids);
    if (error) {
      console.warn('Erro ao reordenar:', error.message);
      onReordered();
    }
  }

  /**
   * Otimiza a ordem dos lugares pra minimizar distância total percorrida.
   * Usa nearest-neighbor a partir do primeiro lugar (mantém a manhã).
   * Recalcula start_times baseado em duração + tempo de deslocamento estimado.
   */
  async function handleOptimize() {
    const withCoord = items.filter(
      (i) => i.place?.latitude != null && i.place?.longitude != null,
    );

    if (withCoord.length < 2) {
      toast.info('Precisa de pelo menos 2 lugares com endereço pra otimizar.');
      return;
    }

    // Categorias que nunca devem ser movidas ou ter horário alterado
    const FIXED_CATEGORIES = ['flight', 'airport', 'lodging', 'hotel', 'hostel', 'airbnb', 'motel'];

    // Item é fixo se: tem categoria de voo/hospedagem OU foi editado pelo usuário (tem start_time)
    const isFixed = (item: ItineraryItem) => {
      const cat = (item.place?.category ?? '').toLowerCase();
      return FIXED_CATEGORIES.some((c) => (cat ?? '').includes(c));
    };

    // Itens que o usuário já definiu horário — perguntar antes de alterar
    const withUserTime = items.filter(
      (i) => i.start_time && !isFixed(i)
    );

    const movableItems = items.filter((i) => !isFixed(i));
    const fixedItems = items.filter((i) => isFixed(i));

    if (movableItems.length < 2) {
      toast.info('Não há lugares suficientes para reordenar (voos e hospedagens são mantidos no lugar).');
      return;
    }

    setOptimizing(true);

    try {
      const flatMovable = movableItems.map((i) => ({
        id: i.id,
        latitude: i.place?.latitude ?? null,
        longitude: i.place?.longitude ?? null,
        start_time: i.start_time,
        duration_minutes: i.duration_minutes,
      }));

      const beforeKm = totalDistanceKm(flatMovable);
      const sorted = sortByProximity(flatMovable);

      // Para itens com horário fixo do usuário, não alterar start_time
      const withTimes = recomputeStartTimes(sorted).map((it) => {
        const original = movableItems.find((m) => m.id === it.id);
        if (original?.start_time) {
          // Mantém o horário que o usuário definiu
          return { ...it, start_time: original.start_time };
        }
        return it;
      });

      const afterKm = totalDistanceKm(withTimes);
      const savedKm = beforeKm - afterKm;

      if (savedKm < 0.1) {
        toast.info('A ordem já está bem otimizada!');
        setOptimizing(false);
        return;
      }

      // Monta preview das mudanças para confirmação se há horários do usuário afetados
      const hasUserTimesAffected = withUserTime.length > 0;

      const doApply = async () => {
        // Recalcula posições globais preservando fixos
        // Intercala fixos (na posição original) com os reordenados
        const allOrdered: Array<{ id: string; position: number; start_time: string | null }> = [];

        // Mantém fixos com position original
        fixedItems.forEach((item, idx) => {
          allOrdered.push({ id: item.id, position: items.indexOf(item), start_time: item.start_time });
        });

        // Movables recebem posições nos slots restantes
        const usedPositions = new Set(fixedItems.map((i) => items.indexOf(i)));
        const freeSlots = items.map((_, i) => i).filter((i) => !usedPositions.has(i));

        withTimes.forEach((it, idx) => {
          const slot = freeSlots[idx] ?? (items.length + idx);
          allOrdered.push({ id: it.id, position: slot, start_time: it.start_time });
        });

        const updates = allOrdered.map((it) =>
          supabase
            .from('itinerary_items')
            .update({ position: it.position, start_time: it.start_time })
            .eq('id', it.id),
        );

        const results = await Promise.all(updates);
        const failed = results.filter((r) => r.error);
        if (failed.length > 0) {
          console.warn('Alguns updates falharam:', failed);
        }

        if (savedKm > 0.5) {
          toast.success(`Rota otimizada! Economizando ~${savedKm.toFixed(1)} km.`);
        } else {
          toast.success('Ordem atualizada.');
        }
        onReordered();
      };

      if (hasUserTimesAffected) {
        // Pede confirmação se vai reordenar itens com horários definidos pelo usuário
        Alert.alert(
          'Confirmar otimização',
          `Você definiu horários em ${withUserTime.length} ${withUserTime.length === 1 ? 'lugar' : 'lugares'}. Os horários serão mantidos mas a ordem pode mudar.\n\nVoos e hospedagens não serão alterados.\n\nEconomia estimada: ~${savedKm.toFixed(1)} km`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => setOptimizing(false) },
            { text: 'Otimizar', onPress: () => doApply().finally(() => setOptimizing(false)) },
          ]
        );
      } else {
        await doApply();
        setOptimizing(false);
      }

    } catch (err) {
      console.error('Erro ao otimizar:', err);
      toast.error('Não foi possível otimizar a rota.');
      setOptimizing(false);
    }
  }

  async function moveByOffset(itemId: string, offset: number) {
    const idx = items.findIndex((i) => i.id === itemId);
    const newIdx = idx + offset;
    if (idx === -1 || newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setItems(next);
    persistOrder(next);
  }

  function handleDragEnd({ data }: { data: ItineraryItem[] }) {
    setItems(data);
    persistOrder(data);
  }

  const isEmpty = items.length === 0;

  return (
    <View style={styles.dayBlock}>
      <AnimatedPress
        onPress={onOpenDay}
        pressScale={0.99}
        style={styles.dayHeader}
      >
        <View style={styles.dayHeaderText}>
          <Text style={styles.dayNumber}>Dia {dayNumber}</Text>
          <Text style={styles.dayDate}>{formatDateLongBR(dayDate)}</Text>
          {weatherData && (
            <View style={styles.dayWeatherRow}>
              <Text style={styles.dayWeatherIcon}>{weatherCodeToIcon(weatherData.weatherCode)}</Text>
              <Text style={[styles.dayWeatherTemp, weatherSevere && styles.dayWeatherTempDanger]}>
                {weatherData.tempMax.toFixed(0)}°/{weatherData.tempMin.toFixed(0)}°
              </Text>
              {weatherSevere && <Text style={styles.dayWeatherAlert}>⚠️</Text>}
            </View>
          )}
        </View>
        <View style={styles.dayHeaderHint}>
          {items.length > 0 && (
            <Text style={styles.dayCount}>
              {items.length} {items.length === 1 ? 'parada' : 'paradas'}
            </Text>
          )}
          {(() => {
            const totalMin = items.reduce((acc, it) => acc + (it.duration_minutes ?? 0), 0);
            if (totalMin < 30) return null;
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            return (
              <Text style={styles.dayDuration}>
                {h > 0 ? `${h}h` : ''}{m > 0 ? `${String(m).padStart(2, '0')}min` : ''}
              </Text>
            );
          })()}
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </AnimatedPress>

      {/* Banners de hospedagem do dia (check-in/out/estamos hospedados) */}
      {lodgingEvents && (
        <LodgingDayBanners
          events={lodgingEvents}
          tripId={tripId}
          onNavigate={(lodgingId) => router.push(`/(app)/trip/${tripId}/lodging/${lodgingId}` as any)}
        />
      )}

      {/* Botão "Iniciar roteiro" — abre Google Maps com waypoints na ordem.
          Só aparece se tem 2+ paradas com coordenadas (faz sentido traçar rota). */}
      {(() => {
        const routePoints = extractRoutePoints(items);
        if (routePoints.length < 2) return null;
        return (
          <AnimatedPress
            onPress={async () => {
              const ok = await openRouteInMaps(routePoints, 'walking');
              if (!ok && toast) toast.error('Não consegui abrir o app de mapas.');
            }}
            pressScale={0.97}
            style={styles.startRouteBtn}
          >
            <Navigation size={14} color={colors.primary} />
            <Text style={styles.startRouteBtnText}>
              Iniciar roteiro no Maps
            </Text>
            <Text style={styles.startRouteHint}>
              {routePoints.length} {routePoints.length === 1 ? 'parada' : 'paradas'}
            </Text>
          </AnimatedPress>
        );
      })()}

      {isEmpty ? (
        <Text style={styles.emptyDay}>Nada planejado nesse dia.</Text>
      ) : Platform.OS === 'web' ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            isFlightItem(item) ? (
              <FlightRow key={item.id} item={item} onRemove={() => onRemoveItem(item.id)} />
            ) : (
              <ItineraryRow
                key={item.id}
                item={item}
                onRemove={() => onRemoveItem(item.id)}
                onMoveToDay={() => onMoveItem(item.id)}
                onPress={() => onEditItem?.(item)}
                onAnalyzeSafety={() => setSafetyItem(item)}
                hasSafetyAlert={!!(item.place?.id && safetyAlertIds.has(item.place.id))}
                safetyAlerts={item.place?.id ? safetyAlertMap.get(item.place.id) : undefined}
                weatherIcon={weatherData ? weatherCodeToIcon(weatherData.weatherCode) : undefined}
                weatherLabel={weatherData ? weatherCodeToLabel(weatherData.weatherCode) : undefined}
                weatherTemp={weatherData ? `${Math.round(weatherData.tempMax)}°/${Math.round(weatherData.tempMin)}°` : undefined}
                hasWeatherAlert={weatherSevere}
                showTime
                webControls={{
                  canMoveUp: index > 0,
                  canMoveDown: index < items.length - 1,
                  onMoveUp: () => moveByOffset(item.id, -1),
                  onMoveDown: () => moveByOffset(item.id, 1),
                }}
              />
            )
          ))}
        </View>
      ) : (
        <DraggableFlatList
          data={items}
          keyExtractor={(it: ItineraryItem) => it.id}
          onDragEnd={handleDragEnd}
          activationDistance={10}
          containerStyle={styles.itemsList}
          renderItem={({
            item,
            drag,
            isActive,
          }: {
            item: ItineraryItem;
            drag: () => void;
            isActive: boolean;
          }) => (
            isFlightItem(item) ? (
              <FlightRow item={item} onRemove={() => onRemoveItem(item.id)} />
            ) : (
              <ItineraryRow
                item={item}
                onRemove={() => onRemoveItem(item.id)}
                onMoveToDay={() => onMoveItem(item.id)}
                onPress={() => onEditItem?.(item)}
                onAnalyzeSafety={() => setSafetyItem(item)}
                hasSafetyAlert={!!(item.place?.id && safetyAlertIds.has(item.place.id))}
                safetyAlerts={item.place?.id ? safetyAlertMap.get(item.place.id) : undefined}
                weatherIcon={weatherData ? weatherCodeToIcon(weatherData.weatherCode) : undefined}
                weatherLabel={weatherData ? weatherCodeToLabel(weatherData.weatherCode) : undefined}
                weatherTemp={weatherData ? `${Math.round(weatherData.tempMax)}°/${Math.round(weatherData.tempMin)}°` : undefined}
                hasWeatherAlert={weatherSevere}
                showTime
                mobileDrag={{ onLongPress: drag, isActive }}
              />
            )
          )}
        />
      )}

      <Button
        title="Adicionar lugar"
        variant="secondary"
        size="sm"
        leftIcon={<Plus size={16} color={colors.text} />}
        onPress={onAddPlace}
        style={styles.addButton}
      />

      {items.length >= 2 && (
        <View style={styles.aiActionsRow}>
          <Button
            title="Sugerir mais"
            variant="ghost"
            size="sm"
            leftIcon={<Sparkles size={14} color={colors.primary} />}
            onPress={onSuggestMore}
            style={{ flex: 1 }}
          />
          <Button
            title="Otimizar ordem"
            variant="ghost"
            size="sm"
            leftIcon={<Route size={14} color={colors.primary} />}
            onPress={() => handleOptimize()}
            loading={optimizing}
            disabled={optimizing}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {items.length < 2 && items.length > 0 && (
        <Button
          title="Sugerir mais lugares"
          variant="ghost"
          size="sm"
          leftIcon={<Sparkles size={14} color={colors.primary} />}
          onPress={onSuggestMore}
        />
      )}

      {/* Modal de análise de segurança */}
      {safetyItem && (
        <SafetyAnalysisModal
          visible={!!safetyItem}
          placeId={safetyItem.place?.id ?? safetyItem.id}
          placeName={safetyItem.custom_title ?? safetyItem.place?.name ?? 'Local'}
          placeAddress={safetyItem.place?.address}
          currentUserId={user?.id ?? null}
          onClose={() => setSafetyItem(null)}
        />
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  dayBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    // Sombra sutil pra dar profundidade aos cards
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 2, // hit area
  },
  dayHeaderText: {
    flex: 1,
    gap: 2,
  },
  dayHeaderHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  dayDuration: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  dayNumber: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  dayDate: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: letterSpacing.tight,
    marginTop: 2,
  },
  dayWeatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dayWeatherIcon: { fontSize: 14 },
  dayWeatherTemp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  dayWeatherTempDanger: { color: colors.danger },
  dayWeatherAlert: { fontSize: 12 },
  emptyDay: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  startRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.primarySofter,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: radius.md,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  startRouteBtnText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  startRouteHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  itemsList: { gap: 0 },
  addButton: { alignSelf: 'flex-start' },
  aiActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}

/**
 * Banners compactos mostrando eventos de hospedagem do dia.
 * - "Check-in: Hotel X · 15h" (verde teal)
 * - "Check-out: Hotel X · 11h" (laranja sutil)
 * - "Hospedado em Hotel X" (cinza, info)
 */
function LodgingDayBanners({ events, tripId, onNavigate }: { events: DayLodgingEvents; tripId: string; onNavigate: (lodgingId: string) => void }) {
  const total =
    events.checkIn.length + events.checkOut.length + events.staying.length;
  if (total === 0) return null;

  return (
    <View style={lodgingBannerStyles.wrap}>
      {events.checkIn.map((l) => (
        <LodgingBanner
          key={`in-${l.id}`}
          tone="primary"
          icon={<KeyRound size={12} color={colors.primaryTextOnSolid} />}
          label="Check-in"
          name={l.name}
          time={l.check_in_at ? formatTime(l.check_in_at) : null}
          kind={l.kind as LodgingKind}
          onPress={() => onNavigate(l.id)}
        />
      ))}
      {events.checkOut.map((l) => (
        <LodgingBanner
          key={`out-${l.id}`}
          tone="warning"
          icon={<LogOut size={12} color={colors.text} />}
          label="Check-out"
          name={l.name}
          time={l.check_out_at ? formatTime(l.check_out_at) : null}
          kind={l.kind as LodgingKind}
          onPress={() => onNavigate(l.id)}
        />
      ))}
      {events.staying.map((l) => {
        const Icon = LODGING_KIND_ICONS[l.kind as LodgingKind] ?? LODGING_KIND_ICONS.other;
        return (
          <LodgingBanner
            key={`stay-${l.id}`}
            tone="muted"
            icon={<Icon size={12} color={colors.textMuted} />}
            label="Hospedado em"
            name={l.name}
            time={null}
            kind={l.kind as LodgingKind}
          />
        );
      })}
    </View>
  );
}

function LodgingBanner({
  tone,
  icon,
  label,
  name,
  time,
  onPress,
}: {
  tone: 'primary' | 'warning' | 'muted';
  icon: React.ReactNode;
  label: string;
  name: string;
  time: string | null;
  kind: LodgingKind;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const toneStyle = {
    primary: {
      bg: colors.primary,
      labelColor: colors.primaryTextOnSolid,
      nameColor: colors.primaryTextOnSolid,
      timeColor: 'rgba(255, 255, 255, 0.85)',
    },
    warning: {
      bg: colors.surfaceAlt,
      labelColor: colors.text,
      nameColor: colors.text,
      timeColor: colors.textMuted,
    },
    muted: {
      bg: colors.surfaceAlt,
      labelColor: colors.textMuted,
      nameColor: colors.text,
      timeColor: colors.textMuted,
    },
  }[tone];

  return (
    <AnimatedPress
      onPress={onPress}
      pressScale={onPress ? 0.97 : 1}
      style={[lodgingBannerStyles.banner, { backgroundColor: toneStyle.bg }]}
    >
      <View style={lodgingBannerStyles.iconBox}>{icon}</View>
      <View style={lodgingBannerStyles.textBox}>
        <Text style={[lodgingBannerStyles.label, { color: toneStyle.labelColor }]}>
          {label}
        </Text>
        <Text
          style={[lodgingBannerStyles.name, { color: toneStyle.nameColor }]}
          numberOfLines={1}
        >
          {name}
        </Text>
      </View>
      {time && (
        <Text style={[lodgingBannerStyles.time, { color: toneStyle.timeColor }]}>
          {time}
        </Text>
      )}
    </AnimatedPress>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const lodgingBannerStyles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  textBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
  },
  name: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  time: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
