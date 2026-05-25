import { useFocusEffect, useRouter } from 'expo-router';
import {useCallback, useState, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { Calendar, Plane, Share as ShareIcon, Sparkles } from '@/components/Icon';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { SkeletonCard } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { getDayLodgingEvents, type Lodging } from '@/lib/lodgings';
import { moveItemToDay } from '@/lib/itinerary';
import type { SearchResult } from '@/lib/places';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase, type Trip } from '@/lib/supabase';
import { supabaseQueued } from '@/lib/supabaseQueued';
import { colors, fontSize, spacing } from '@/lib/theme';

import { DayBlock } from './DayBlock';
import { DayBlockTimeline } from './DayBlockTimeline';
import { EditItineraryItemModal } from './EditItineraryItemModal';
import { ImportFlightModal } from './ImportFlightModal';
import { PickDayModal } from './PickDayModal';
import { SuggestItineraryModal } from './SuggestItineraryModal';
import { SuggestMorePlacesModal } from './SuggestMorePlacesModal';
import type { ItineraryItem, TripDay } from './types';
import { useTheme } from '@/components/ThemeProvider';

export function ItineraryTab({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [lodgings, setLodgings] = useState<Lodging[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpenForDay, setPickerOpenForDay] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  // Quando user clica "mover" num item: guarda qual item, abre o PickDayModal
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [importFlightOpen, setImportFlightOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestMoreForDay, setSuggestMoreForDay] = useState<string | null>(null);
  /** Modo de visualização do roteiro — "list" (padrão) ou "timeline" (manhã/tarde/noite) */
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  async function handleShareItinerary() {
    const lines: string[] = [`📍 ${trip.title}`];
    if (trip.start_date) lines.push(`📅 ${trip.start_date} → ${trip.end_date ?? '?'}`);
    lines.push('');

    const allItems = items.slice().sort((a, b) => {
      const dayA = days.findIndex(d => d.id === a.trip_day_id);
      const dayB = days.findIndex(d => d.id === b.trip_day_id);
      if (dayA !== dayB) return dayA - dayB;
      return (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });

    let lastDayId = '';
    for (const item of allItems) {
      const day = days.find(d => d.id === item.trip_day_id);
      if (!day) continue;
      if (item.trip_day_id !== lastDayId) {
        const dt = new Date(day.day_date + 'T12:00:00');
        lines.push(`── ${dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()} ──`);
        lastDayId = item.trip_day_id;
      }
      const time = item.start_time ? `${item.start_time.slice(0, 5)} ` : '';
      const name = (item as any).place?.name ?? item.custom_title ?? 'Local';
      const dur = item.duration_minutes ? ` (${item.duration_minutes}min)` : '';
      lines.push(`${time}• ${name}${dur}`);
    }

    lines.push('');
    lines.push('Compartilhado via Trajet 🧳');

    await Share.share({ message: lines.join('\n') });
  }

  const fetchData = useCallback(async () => {
    const [daysResult, itemsResult, lodgingsResult] = await Promise.all([
      supabase
        .from('trip_days')
        .select('id, day_date, position, notes')
        .eq('trip_id', trip.id)
        .order('day_date'),
      supabase
        .from('itinerary_items')
        .select(
          'id, trip_day_id, custom_title, start_time, duration_minutes, notes, position, place:places(id, name, address, category, latitude, longitude, photo_url)'
        )
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('position'),
      // Lodgings só faz sentido buscar se a feature está ativa
      trip.feature_lodging !== false
        ? supabase
            .from('lodgings')
            .select('*')
            .eq('trip_id', trip.id)
        : Promise.resolve({
            data: [] as Lodging[],
            error: null as null,
          }),
    ]);

    if (daysResult.error) console.error(daysResult.error);
    if (itemsResult.error) console.error(itemsResult.error);
    if (lodgingsResult.error) console.error(lodgingsResult.error);

    const dayList = daysResult.data ?? [];
    setDays(dayList);
    setLodgings((lodgingsResult.data ?? []) as Lodging[]);

    const dayIds = new Set(dayList.map((d) => d.id));
    setItems(
      ((itemsResult.data ?? []) as unknown as ItineraryItem[]).filter((it) =>
        dayIds.has(it.trip_day_id)
      )
    );
    setLoading(false);
  }, [trip.id, trip.feature_lodging]);

  const refreshProps = usePullToRefresh(fetchData);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useRealtimeTable({
    table: 'trip_days',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchData,
  });
  useRealtimeTable({
    table: 'itinerary_items',
    onChange: fetchData,
  });
  useRealtimeTable({
    table: 'lodgings',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchData,
    enabled: trip.feature_lodging !== false,
  });

  async function handleAddPlace(dayId: string, place: SearchResult) {
    const { data: newPlace, error: placeError } = await supabase
      .from('places')
      .insert({
        trip_id: trip.id,
        name: place.name,
        address: place.fullAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
        google_place_id: place.externalId,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (placeError || !newPlace) {
      toast.error(placeError?.message ?? 'Erro ao salvar lugar.');
      return;
    }

    const dayItems = items.filter((i) => i.trip_day_id === dayId);
    const { error: itemError, queued } = await supabaseQueued
      .from('itinerary_items')
      .insert({
        trip_day_id: dayId,
        place_id: newPlace.id,
        position: dayItems.length,
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
  }

  async function handleRemoveItem(itemId: string) {
    const { error } = await supabase
      .from('itinerary_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleMoveItem(targetDayId: string) {
    if (!movingItemId) return;
    const { error } = await moveItemToDay(movingItemId, targetDayId);
    setMovingItemId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Item movido.');
    fetchData();
  }

  if (loading) {
    return (
      <View style={styles.list}>
        <SkeletonCard lines={3} />
        <View style={{ height: spacing.md }} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  if (days.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={36} color={colors.primary} />}
        title="Sem dias planejados"
        description="Defina as datas de início e fim da viagem pra ver os dias aparecerem aqui."
        action={{
          label: 'Definir datas',
          onPress: () => router.push(`/(app)/trip/${trip.id}/edit`),
        }}
      />
    );
  }

  // Encontra dia atual do item sendo movido (pra desabilitar no modal)
  const currentDayIdOfMovingItem =
    movingItemId !== null
      ? items.find((i) => i.id === movingItemId)?.trip_day_id ?? ''
      : '';

  return (
    <>
      <FlatList
        data={days}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshProps} />}
        ListHeaderComponent={
          <View style={styles.headerActionsCol}>
            {/* Toggle Lista / Timeline */}
            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => setViewMode('list')}
                style={[
                  styles.toggleBtn,
                  viewMode === 'list' && styles.toggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.toggleLabel,
                    viewMode === 'list' && styles.toggleLabelActive,
                  ]}
                >
                  Lista
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('timeline')}
                style={[
                  styles.toggleBtn,
                  viewMode === 'timeline' && styles.toggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.toggleLabel,
                    viewMode === 'timeline' && styles.toggleLabelActive,
                  ]}
                >
                  Timeline
                </Text>
              </Pressable>
            </View>

            <View style={styles.headerActions}>
              <Button
                title="Sugerir com IA"
                variant="ghost"
                size="sm"
                leftIcon={<Sparkles size={14} color={colors.primary} />}
                onPress={() => setSuggestOpen(true)}
              />
              <Button
                title="Importar voo"
                variant="ghost"
                size="sm"
                leftIcon={<Plane size={14} color={colors.primary} />}
                onPress={() => setImportFlightOpen(true)}
              />
              {items.length > 0 && (
                <Button
                  title="Compartilhar"
                  variant="ghost"
                  size="sm"
                  leftIcon={<ShareIcon size={14} color={colors.primary} />}
                  onPress={handleShareItinerary}
                />
              )}
            </View>
          </View>
        }
        renderItem={({ item: day, index }) => {
          const dayItems = items
            .filter((i) => i.trip_day_id === day.id)
            .sort((a, b) => {
              // Ordena por start_time se ambos tiverem, senão por position
              if (a.start_time && b.start_time) {
                return a.start_time.localeCompare(b.start_time);
              }
              if (a.start_time) return -1;
              if (b.start_time) return 1;
              return a.position - b.position;
            });

          const lodgingEvents = getDayLodgingEvents(lodgings, day.day_date);

          return (
            <FadeInView delay={getStaggerDelay(index, 80, 320)}>
              {viewMode === 'timeline' ? (
                <DayBlockTimeline
                  dayDate={day.day_date}
                  dayNumber={index + 1}
                  items={dayItems}
                  lodgingEvents={lodgingEvents}
                  onAddPlace={() => setPickerOpenForDay(day.id)}
                  onSuggestMore={() => setSuggestMoreForDay(day.id)}
                  onRemoveItem={handleRemoveItem}
                  onMoveItem={(itemId) => setMovingItemId(itemId)}
                  onOpenDay={() =>
                    router.push(`/(app)/trip/${trip.id}/day/${day.id}`)
                  }
                  onReordered={fetchData}
                  onItemPress={(item) => setEditingItem(item)}
                />
              ) : (
                <DayBlock
                  tripId={trip.id}
                  dayDate={day.day_date}
                  dayNumber={index + 1}
                  items={dayItems}
                  lodgingEvents={lodgingEvents}
                  onAddPlace={() => setPickerOpenForDay(day.id)}
                  onSuggestMore={() => setSuggestMoreForDay(day.id)}
                  onRemoveItem={handleRemoveItem}
                  onMoveItem={(itemId) => setMovingItemId(itemId)}
                  onOpenDay={() =>
                    router.push(`/(app)/trip/${trip.id}/day/${day.id}`)
                  }
                  onReordered={fetchData}
                  onEditItem={(item) => setEditingItem(item)}
                />
              )}
            </FadeInView>
          );
        }}
      />

      <PlaceSearchModal
        visible={pickerOpenForDay !== null}
        onClose={() => setPickerOpenForDay(null)}
        onPick={(place) => {
          if (pickerOpenForDay) handleAddPlace(pickerOpenForDay, place);
        }}
        tripContext={trip.title}
      />

      <PickDayModal
        visible={movingItemId !== null}
        days={days}
        currentDayId={currentDayIdOfMovingItem}
        onClose={() => setMovingItemId(null)}
        onSelect={handleMoveItem}
      />

      <ImportFlightModal
        trip={trip}
        visible={importFlightOpen}
        onClose={() => setImportFlightOpen(false)}
        onImported={fetchData}
      />

      <SuggestItineraryModal
        trip={trip}
        visible={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        onApplied={fetchData}
      />

      {suggestMoreForDay && (
        <SuggestMorePlacesModal
          trip={trip}
          visible={true}
          tripDayId={suggestMoreForDay}
          existingItems={items.filter((i) => i.trip_day_id === suggestMoreForDay)}
          onClose={() => setSuggestMoreForDay(null)}
          onAdded={fetchData}
        />
      )}

      {editingItem && (
        <EditItineraryItemModal
          visible={true}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); fetchData(); }}
        />
      )}
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  headerActionsCol: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  viewToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: colors.bg,
  },
}), [themeVersion]);
}
