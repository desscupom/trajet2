import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { CommentsSheet } from '@/components/CommentsSheet';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { Calendar, Clock, Edit, MapPin, MessageCircle, Plus, X } from '@/components/Icon';
import { ReactionsBar } from '@/components/ReactionsBar';
import { EditItineraryItemModal } from '@/components/trip/EditItineraryItemModal';
import { SmartTimeModal } from '@/components/trip/SmartTimeModal';
import { MapView, type MapMarker } from '@/components/MapView';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { Skeleton } from '@/components/Skeleton';
import { EditTimeModal } from '@/components/trip/EditTimeModal';
import type { ItineraryItem, TripDay } from '@/components/trip/types';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { formatDateLongBR } from '@/lib/dates';
import type { SearchResult } from '@/lib/places';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase } from '@/lib/supabase';
import { analyzeLocalSafety } from '@/lib/safetyAnalyzer';
import { getUserSafetyPrefs } from '@/lib/safetyAnalyzer';
import { supabaseQueued } from '@/lib/supabaseQueued';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { generateDaySummary, detectConflicts, type Conflict } from '@/lib/itineraryAI';
import { fetchWeatherForLocation, getWeatherForDate, weatherCodeToIcon, weatherCodeToLabel, type WeatherDay } from '@/lib/weather';

export default function DayDetailScreen() {
  const styles = useStyles();
  const { id: tripId, dayId } = useLocalSearchParams<{
    id: string;
    dayId: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [allDays, setAllDays] = useState<{ id: string; day_date: string }[]>([]);
  const [day, setDay] = useState<TripDay | null>(null);
  const [dayLodgings, setDayLodgings] = useState<any[]>([]);
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [tripTitle, setTripTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingTimeFor, setEditingTimeFor] = useState<{
    id: string;
    initialTime: string | null;
  } | null>(null);
  const [daySummary, setDaySummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [smartTimeFor, setSmartTimeFor] = useState<{
    itemId: string;
    placeName: string;
    placeExternalId: string;
    placeCategory: string | null;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [weather, setWeather] = useState<WeatherDay | null>(null);

  const fetchData = useCallback(async () => {
    if (!tripId || !dayId) return;

    // Busca o dia + itens dele + posição do dia entre os outros (pra mostrar "Dia X")
    // + título da viagem (pra contextualizar busca de lugares)
    const [dayResult, allDaysResult, itemsResult, tripResult] = await Promise.all([
      supabase.from('trip_days').select('*').eq('id', dayId).single(),
      supabase
        .from('trip_days')
        .select('id, day_date')
        .eq('trip_id', tripId)
        .order('day_date'),
      supabase
        .from('itinerary_items')
        .select(
          'id, trip_day_id, custom_title, start_time, notes, position, place:places(id, name, address, category, latitude, longitude, photo_url, google_place_id)'
        )
        .eq('trip_day_id', dayId)
        .order('position'),
      supabase.from('trips').select('title').eq('id', tripId).maybeSingle(),
    ]);

    if (tripResult.data?.title) setTripTitle(tripResult.data.title);

    if (dayResult.error) console.error(dayResult.error);
    if (itemsResult.error) console.error(itemsResult.error);

    setDay(dayResult.data);

    // Calcula qual dia é (dia 1, 2, ...)
    if (allDaysResult.data && dayResult.data) {
      setAllDays(allDaysResult.data);
      const idx = allDaysResult.data.findIndex((d) => d.id === dayResult.data!.id);
      if (idx >= 0) setDayNumber(idx + 1);
    }

    setItems((itemsResult.data ?? []) as unknown as ItineraryItem[]);

    // Busca hospedagens que cobrem esta data (para mostrar no mapa)
    if (dayResult.data?.day_date) {
      const dateStr = dayResult.data.day_date;
      const { data: lodgings } = await supabase
        .from('lodgings')
        .select('id, name, address, latitude, longitude, kind, check_in_at, check_out_at')
        .eq('trip_id', tripId)
        .not('latitude', 'is', null);
      // Filtra apenas hospedagens ativas neste dia
      const active = (lodgings ?? []).filter((l: any) => {
        if (!l.check_in_at && !l.check_out_at) return false;
        const checkIn = l.check_in_at ? l.check_in_at.slice(0, 10) : null;
        const checkOut = l.check_out_at ? l.check_out_at.slice(0, 10) : null;
        if (checkIn && checkOut) return dateStr >= checkIn && dateStr <= checkOut;
        if (checkIn) return dateStr === checkIn;
        return false;
      });
      setDayLodgings(active);
    }

    setLoading(false);
  }, [tripId, dayId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useRealtimeTable({
    table: 'itinerary_items',
    filter: `trip_day_id=eq.${dayId}`,
    onChange: fetchData,
  });

  useEffect(() => {
    if (day) {
      navigation.setOptions({
        title: `Dia ${dayNumber}`,
      });
    }
  }, [day, dayNumber, navigation]);

  // Ordena por horário (com horário primeiro), depois por position
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.start_time && b.start_time) {
        return a.start_time.localeCompare(b.start_time);
      }
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return a.position - b.position;
    });
  }, [items]);

  // Detecta conflitos toda vez que os items mudam
  useEffect(() => {
    setConflicts(detectConflicts(sortedItems));
  }, [sortedItems]);

  // Busca clima quando temos a data do dia
  // Tenta: 1) coords do primeiro lugar, 2) geocoding do título da viagem
  useEffect(() => {
    if (!day?.day_date) return;

    async function loadWeather() {
      // Tenta usar coords do primeiro lugar com coordenadas
      const first = sortedItems.find((it) => it.place?.latitude && it.place?.longitude);
      if (first?.place?.latitude && first?.place?.longitude) {
        const w = await fetchWeatherForLocation(first.place.latitude, first.place.longitude).then(days => getWeatherForDate(days, day!.day_date));
        if (w) { setWeather(w); return; }
      }

      // Fallback: geocoding pelo nome da viagem via Nominatim (Open-Meteo companion)
      if (!tripTitle) return;
      try {
        const geo = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(tripTitle)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'Trajet App/1.0' } }
        );
        if (!geo.ok) return;
        const geoData = await geo.json();
        if (!geoData?.[0]) return;
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);
        if (isNaN(lat) || isNaN(lon)) return;
        const w = await fetchWeatherForLocation(lat, lon).then(days => getWeatherForDate(days, day!.day_date));
        if (w) setWeather(w);
      } catch {}
    }

    loadWeather();
  }, [day?.day_date, sortedItems, tripTitle]);

  const markers = useMemo<MapMarker[]>(() => {
    const placeMarkers = sortedItems
      .map((it) => it.place)
      .filter(
        (p): p is NonNullable<ItineraryItem['place']> & {
          latitude: number;
          longitude: number;
        } => !!p && p.latitude !== null && p.longitude !== null
      )
      .map((p) => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        title: p.name,
        subtitle: p.address,
      }));

    // Adiciona hospedagens do dia ao mapa (com ícone diferente via subtitle)
    const lodgingMarkers: MapMarker[] = (dayLodgings ?? [])
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({
        id: `lodging-${l.id}`,
        latitude: l.latitude!,
        longitude: l.longitude!,
        title: `🏨 ${l.name}`,
        subtitle: l.address ?? undefined,
      }));

    return [...lodgingMarkers, ...placeMarkers];
  }, [sortedItems, dayLodgings]);

  async function handleAddPlace(place: SearchResult) {
    if (!tripId || !dayId) return;

    // 1) Verifica preferências de segurança e analisa ANTES de adicionar
    let safetyAlerts: { alert_type: string; description: string; severity: number }[] = [];
    if (user?.id && tripTitle) {
      try {
        const prefs = await getUserSafetyPrefs(user.id);
        const enabledTypes = Object.entries(prefs).filter(([, v]) => v).map(([k]) => k);
        if (enabledTypes.length > 0) {
          const safety = await analyzeLocalSafety(
            place.name,
            place.externalId ?? place.name,
            tripTitle,
            undefined,
            prefs, // passa prefs já carregadas — evita busca dupla
          );
          if (safety && safety.alerts.length > 0) {
            safetyAlerts = safety.alerts
              .filter((a) => prefs[a.alert_type as keyof typeof prefs] === true && a.severity >= 2)
              .map((a) => ({
                ...a,
                description: a.description.replace(/\*\*/g, '').replace(/\*/g, '').trim(),
              }));
          }
        }
      } catch (e) {
        console.warn('[safety] erro ao analisar:', e);
      }
    }

    // 2) Se tem alertas, confirma com usuário antes de adicionar
    if (safetyAlerts.length > 0) {
      const alertLines = safetyAlerts
        .map((a) => `${a.severity === 3 ? '🔴' : '🟡'} ${a.description}`)
        .join('\n');

      const userConfirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `⚠️ Alerta — ${place.name}`,
          `${alertLines}\n\nAdicionar ao roteiro mesmo assim?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Adicionar', style: 'default', onPress: () => resolve(true) },
          ]
        );
      });

      if (!userConfirmed) return;
    }

    // 3) Cria o place
    const { data: newPlace, error: placeError } = await supabase
      .from('places')
      .insert({
        trip_id: tripId,
        name: place.name,
        address: place.fullAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
        google_place_id: place.externalId,
        created_by: user?.id ?? null,
        photo_url: place.photo_url ?? null,
        neighborhood: place.neighborhood ?? null,
      })
      .select()
      .single();

    if (placeError || !newPlace) {
      toast.error(placeError?.message ?? 'Erro ao salvar lugar.');
      return;
    }

    // 4) Salva os alertas no banco com o UUID real do place
    if (safetyAlerts.length > 0 && user?.id) {
      const inserts = safetyAlerts.map((a) => ({
        place_id: newPlace.id,
        place_name: newPlace.name,
        alert_type: a.alert_type,
        severity: a.severity,
        description: a.description,
        reported_by: user.id,
        confirmed_count: 0,
        source: 'ai',
      }));
      await (supabase as any).from('place_safety_alerts').insert(inserts).catch((e: any) => {
        console.warn('[safety] erro ao salvar alertas:', e?.message);
      });
    }

    // 5) Cria o item no roteiro
    const { error: itemError, queued } = await supabaseQueued
      .from('itinerary_items')
      .insert({
        trip_day_id: dayId,
        place_id: newPlace.id,
        position: items.length,
        created_by: user?.id ?? null,
      });

    if (itemError) {
      toast.error(itemError.message);
      return;
    }
    if (queued) {
      toast.info('Salvo localmente. Sincroniza quando voltar online.');
    }

    fetchData();
    toast.success(`${newPlace.name} adicionado.`);

    // Notifica outros membros via push
    if (user?.id && tripId && tripTitle) {
      import('@/lib/sendPush').then(({ sendPushToTripMembers }) => {
        sendPushToTripMembers({
          tripId,
          excludeProfileId: user.id!,
          title: tripTitle,
          body: `📍 ${newPlace.name} foi adicionado ao roteiro`,
          data: { type: 'place_added', tripId },
        });
      });
    }

    // Busca o item recém-criado para pegar o ID
    const { data: newItem } = await supabase
      .from('itinerary_items')
      .select('id')
      .eq('trip_day_id', dayId)
      .eq('place_id', newPlace.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (newItem?.id) {
      setSmartTimeFor({
        itemId: newItem.id,
        placeName: newPlace.name,
        placeExternalId: place.externalId,
        placeCategory: place.category,
      });
    }
  }


  async function handleRemoveItem(itemId: string) {
    Alert.alert('Remover do dia?', 'O lugar fica salvo, só sai do roteiro deste dia.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('itinerary_items')
            .delete()
            .eq('id', itemId);
          if (error) toast.error(error.message);
          else toast.success('Removido do roteiro.');
        },
      },
    ]);
  }

  if (loading || !day) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <Skeleton height={240} borderRadius={radius.lg} />
          <View style={{ height: spacing.md }} />
          <Skeleton height={56} borderRadius={radius.md} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={sortedItems}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <FadeInView>
            <View style={styles.header}>
              {/* Header do dia: número + data + navegação */}
              <View style={styles.dayNavRow}>
                <Pressable
                  onPress={() => {
                    if (!allDays) return;
                    const idx = allDays.findIndex((d) => d.id === dayId);
                    if (idx > 0) router.replace(`/(app)/trip/${tripId}/day/${allDays[idx - 1].id}`);
                  }}
                  hitSlop={8}
                  style={styles.dayNavBtn}
                >
                  <Text style={styles.dayNavArrow}>‹</Text>
                </Pressable>

                <View style={styles.dayHeaderCenter}>
                  <Text style={styles.dayNumber}>Dia {dayNumber}</Text>
                  <Text style={styles.dateLabel}>{formatDateLongBR(day.day_date)}</Text>
                </View>

                <Pressable
                  onPress={() => {
                    if (!allDays) return;
                    const idx = allDays.findIndex((d) => d.id === dayId);
                    if (idx < allDays.length - 1) router.replace(`/(app)/trip/${tripId}/day/${allDays[idx + 1].id}`);
                  }}
                  hitSlop={8}
                  style={styles.dayNavBtn}
                >
                  <Text style={styles.dayNavArrow}>›</Text>
                </Pressable>
              </View>

              {markers.length > 0 ? (
                <View style={styles.mapWrap}>
                  <MapView markers={markers} showRoute={markers.length > 1} />
                </View>
              ) : null}

              {/* Widget de clima */}
              {weather && (
                <View style={styles.weatherCard}>
                  <Text style={styles.weatherEmoji}>{weatherCodeToIcon(weather.weatherCode)}</Text>
                  <View style={styles.weatherInfo}>
                    <Text style={styles.weatherLabel}>{weatherCodeToLabel(weather.weatherCode)}</Text>
                    <Text style={styles.weatherDetail}>
                      {Math.round(weather.tempMin)}° – {Math.round(weather.tempMax)}°C
                      {weather.precipitationSum > 0 ? `  💧 ${weather.precipitationSum}mm` : ''}
                      {weather.windSpeedMax > 20 ? `  💨 ${Math.round(weather.windSpeedMax)}km/h` : ''}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.headerActions}>
                <Button
                  title="Adicionar lugar"
                  variant="secondary"
                  leftIcon={<Plus size={16} color={colors.text} />}
                  onPress={() => setSearchOpen(true)}
                />
              </View>

              {/* Alertas de conflito */}
              {conflicts.map((c, i) => (
                <View key={i} style={[styles.conflictCard, c.severity === 'warning' && styles.conflictWarn]}>
                  <Text style={styles.conflictIcon}>{c.severity === 'warning' ? '⚠️' : 'ℹ️'}</Text>
                  <Text style={styles.conflictText}>{c.message}</Text>
                </View>
              ))}

              {sortedItems.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>
                    Programação ({sortedItems.length}{' '}
                    {sortedItems.length === 1 ? 'parada' : 'paradas'})
                  </Text>
                  <Pressable
                    onPress={async () => {
                      if (!day || !tripTitle) return;
                      setSummaryLoading(true);
                      try {
                        const text = await generateDaySummary(day.day_date, dayNumber - 1, tripTitle, sortedItems);
                        setDaySummary(text);
                      } catch {
                        toast.error('Não foi possível gerar o resumo.');
                      } finally {
                        setSummaryLoading(false);
                      }
                    }}
                    style={styles.summaryBtn}
                    disabled={summaryLoading}
                  >
                    <Text style={styles.summaryBtnText}>
                      {summaryLoading ? '✨ Gerando...' : '✨ Resumo do dia'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Resumo gerado por IA */}
              {daySummary && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryText}>{daySummary}</Text>
                  <Pressable onPress={() => setDaySummary(null)} style={styles.summaryClose}>
                    <Text style={styles.summaryCloseText}>×</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </FadeInView>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<MapPin size={36} color={colors.primary} />}
            title="Nada planejado nesse dia"
            description="Adicione paradas com horários pra montar a programação do dia."
            action={{
              label: 'Adicionar parada',
              onPress: () => setSearchOpen(true),
            }}
          />
        }
        renderItem={({ item, index }) => (
          <FadeInView delay={getStaggerDelay(index, 50, 240)}>
            <DayItemRow
              item={item}
              index={index}
              isLast={index === sortedItems.length - 1}
              tripId={tripId}
              onEditTime={() =>
                setEditingTimeFor({
                  id: item.id,
                  initialTime: item.start_time,
                })
              }
              onEdit={() => setEditingItem(item)}
              onRemove={() => handleRemoveItem(item.id)}
            />
          </FadeInView>
        )}
      />

      <PlaceSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handleAddPlace}
        tripContext={tripTitle}
      />

      <EditTimeModal
        itemId={editingTimeFor?.id ?? null}
        initialTime={editingTimeFor?.initialTime ?? null}
        onClose={() => setEditingTimeFor(null)}
        onSaved={fetchData}
      />

      <EditItineraryItemModal
        visible={!!editingItem}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => { setEditingItem(null); fetchData(); }}
        onEditTime={() => {
          if (editingItem) {
            setEditingTimeFor({ id: editingItem.id, initialTime: editingItem.start_time });
          }
        }}
      />

      {smartTimeFor && (
        <SmartTimeModal
          visible={!!smartTimeFor}
          itemId={smartTimeFor.itemId}
          placeName={smartTimeFor.placeName}
          placeExternalId={smartTimeFor.placeExternalId}
          placeCategory={smartTimeFor.placeCategory}
          dayId={dayId}
          onSave={(_time, _dur) => {
            setSmartTimeFor(null);
            fetchData();
          }}
          onSkip={() => setSmartTimeFor(null)}
        />
      )}
    </SafeAreaView>
  );
}

function DayItemRow({
  item,
  index,
  isLast,
  tripId,
  onEditTime,
  onEdit,
  onRemove,
}: {
  item: ItineraryItem;
  index: number;
  isLast: boolean;
  tripId: string;
  onEditTime: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const title = item.custom_title || item.place?.name || 'Sem título';
  const subtitle = item.place?.address;
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <View style={styles.timelineRow}>
      {/* Coluna da timeline (linha + dot) */}
      <View style={styles.timelineCol}>
        {/* Bolinha numerada */}
        <View style={styles.timelineDot}>
          <Text style={styles.timelineDotText}>{index + 1}</Text>
        </View>
        {/* Linha vertical conectora (não desenha no último item) */}
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      {/* Card do conteúdo */}
      <View style={styles.timelineCard}>
        {/* Horário em pill (acima do título) */}
        <View style={styles.timelineCardHeader}>
          <AnimatedPress
            onPress={onEditTime}
            pressScale={0.95}
            style={[styles.timeChip, item.start_time && styles.timeChipFilled]}
          >
            <Clock
              size={12}
              color={item.start_time ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.timeChipText,
                item.start_time && styles.timeChipTextFilled,
              ]}
            >
              {item.start_time
                ? item.start_time.slice(0, 5)
                : 'Definir horário'}
            </Text>
          </AnimatedPress>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable onPress={onEdit} hitSlop={8} style={styles.editBtn}>
              <Edit size={13} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={onEdit}>
          <Text style={styles.timelineTitle} numberOfLines={2}>
            {title}
          </Text>
        </Pressable>
        {!!subtitle && (
          <Text style={styles.timelineSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {item.notes && (
          <Pressable onPress={onEdit} style={styles.notesChip}>
            <Text style={styles.notesChipText} numberOfLines={2}>💬 {item.notes}</Text>
          </Pressable>
        )}
        {item.place?.category && (
          <View style={styles.timelineCategory}>
            <Text style={styles.timelineCategoryText}>
              {item.place.category}
            </Text>
          </View>
        )}

        {/* Reações */}
        <ReactionsBar tripId={tripId} itemId={item.id} />

        {/* Botão comentários */}
        <Pressable onPress={() => setCommentsOpen(true)} style={styles.commentBtn}>
          <MessageCircle size={12} color={colors.textMuted} />
          <Text style={styles.commentBtnText}>Comentar</Text>
        </Pressable>

        <CommentsSheet
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          tripId={tripId}
          entityType="itinerary_item"
          entityId={item.id}
          entityTitle={title}
        />
      </View>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavArrow: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 28,
  },
  dayHeaderCenter: { alignItems: 'center', flex: 1, gap: 2 },
  dayNumber: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dateIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  mapWrap: {
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  weatherEmoji: { fontSize: 28 },
  weatherInfo: { flex: 1 },
  weatherLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  weatherDetail: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  // Timeline visual — linha vertical à esquerda + dot numerado + card
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 80,
  },
  timelineCol: {
    width: 32,
    alignItems: 'center',
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    borderWidth: 3,
    borderColor: colors.bg,
  },
  timelineDotText: {
    color: colors.primaryTextOnSolid,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  timelineLine: {
    position: 'absolute',
    top: 32,
    bottom: -12,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: 4,
  },
  timelineCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  timeChipFilled: {
    backgroundColor: colors.primarySoft,
  },
  timeChipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  timeChipTextFilled: {
    color: colors.primary,
  },
  timelineTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  timelineSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  timelineCategory: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  timelineCategoryText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  notesChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: 4,
  },
  notesChipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  commentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    padding: 4,
  },
  commentBtnText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  conflictCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.info + '30',
  },
  conflictWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning + '40',
  },
  conflictIcon: { fontSize: 14, marginTop: 1 },
  conflictText: { flex: 1, color: colors.text, fontSize: fontSize.xs, lineHeight: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.primarySoft, borderRadius: radius.pill },
  summaryBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  summaryCard: {
    backgroundColor: colors.primarySofter,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  summaryText: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 22, fontStyle: 'italic' },
  summaryClose: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  summaryCloseText: { color: colors.textMuted, fontSize: 18, fontWeight: '300' },
}), [themeVersion]);
}
