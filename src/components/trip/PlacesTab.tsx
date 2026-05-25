import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

import { Button } from '@/components/Button';
import { AnimatedPress } from '@/components/AnimatedPress';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { CircleAlert, MapPin, Plus, Share as ShareIcon, X } from '@/components/Icon';
import { MapView, type MapMarker } from '@/components/MapView';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { translateCategory } from '@/lib/categoryLabels';
import type { SearchResult } from '@/lib/places';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase, type Trip } from '@/lib/supabase';
import { supabaseQueued } from '@/lib/supabaseQueued';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Place = {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  visited?: boolean;
  visited_at?: string | null;
};

export function PlacesTab({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [lodgings, setLodgings] = useState<{
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [storiePlace, setStoriePlace] = useState<Place | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const fetchPlaces = useCallback(async () => {
    const placesPromise = supabase
      .from('places')
      .select('id, name, address, category, latitude, longitude, google_place_id')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false }) as any;

    // Só busca hospedagens com coordenadas pra mostrar no mapa.
    // Se feature_lodging off, pula.
    const lodgingsPromise =
      trip.feature_lodging !== false
        ? supabase
            .from('lodgings')
            .select('id, name, address, latitude, longitude')
            .eq('trip_id', trip.id)
            .not('latitude', 'is', null)
        : Promise.resolve({
            data: [] as {
              id: string;
              name: string;
              address: string | null;
              latitude: number | null;
              longitude: number | null;
            }[],
            error: null as null,
          });

    const [placesResult, lodgingsResult] = await Promise.all([
      placesPromise,
      lodgingsPromise,
    ]);

    if (placesResult.error) console.error(placesResult.error);
    if (lodgingsResult.error) console.error(lodgingsResult.error);

    setPlaces(placesResult.data ?? []);
    setLodgings(lodgingsResult.data ?? []);
    setLoading(false);
  }, [trip.id, trip.feature_lodging]);

  const refreshProps = usePullToRefresh(fetchPlaces);

  async function toggleVisited(place: Place) {
    const newVisited = !place.visited;
    // Optimistic
    setPlaces(prev => prev.map(p => p.id === place.id
      ? { ...p, visited: newVisited, visited_at: newVisited ? new Date().toISOString() : null }
      : p
    ));
    const { error } = await (supabase as any).from('places')
      .update({ visited: newVisited, visited_at: newVisited ? new Date().toISOString() : null })
      .eq('id', place.id);
    if (error) {
      setPlaces(prev => prev.map(p => p.id === place.id ? { ...p, visited: place.visited, visited_at: place.visited_at } : p));
      toast.error('Não foi possível atualizar.');
      return;
    }
    // Abre modal de storie ao fazer check-in
    if (newVisited) {
      setStoriePlace({ ...place, visited: true, visited_at: new Date().toISOString() });
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchPlaces();
    }, [fetchPlaces])
  );

  useRealtimeTable({
    table: 'places',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchPlaces,
  });
  useRealtimeTable({
    table: 'lodgings',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchPlaces,
    enabled: trip.feature_lodging !== false,
  });

  const markers = useMemo<MapMarker[]>(
    () => [
      ...places
        .filter(
          (p): p is Place & { latitude: number; longitude: number } =>
            p.latitude !== null && p.longitude !== null
        )
        .map((p) => ({
          id: p.id,
          latitude: p.latitude,
          longitude: p.longitude,
          title: p.name,
          subtitle: p.address,
          kind: 'place' as const,
        })),
      ...lodgings
        .filter(
          (l): l is typeof l & { latitude: number; longitude: number } =>
            l.latitude !== null && l.longitude !== null
        )
        .map((l) => ({
          id: `lodging-${l.id}`,
          latitude: l.latitude,
          longitude: l.longitude,
          title: `🏨 ${l.name}`,
          subtitle: l.address,
          kind: 'lodging' as const,
        })),
    ],
    [places, lodgings]
  );

  async function handleAddPlace(found: SearchResult) {
    const existing = places.find((p) => p.google_place_id === found.externalId);
    if (existing) {
      setFocusedId(existing.id);
      return;
    }

    const { data, error } = await supabase
      .from('places')
      .insert({
        trip_id: trip.id,
        name: found.name,
        address: found.fullAddress,
        latitude: found.latitude,
        longitude: found.longitude,
        category: found.category,
        google_place_id: found.externalId,
        created_by: user?.id ?? null,
        photo_url: found.photo_url ?? null,
        neighborhood: found.neighborhood ?? null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data) {
      setPlaces((prev) => [data as Place, ...prev]);
      setFocusedId(data.id);
      toast.success(`${data.name} adicionado.`);
    }
  }

  async function handleRemove(place: Place) {
    const { data: linkedItems } = await supabase
      .from('itinerary_items')
      .select('id')
      .eq('place_id', place.id);

    const isInItinerary = (linkedItems?.length ?? 0) > 0;

    // Remove itinerary_items vinculados primeiro para evitar violação de constraint
    if (isInItinerary && linkedItems && linkedItems.length > 0) {
      await supabase
        .from('itinerary_items')
        .delete()
        .in('id', linkedItems.map((i: any) => i.id));
    }

    const { error, queued } = await supabaseQueued
      .from('places')
      .delete()
      .eq('id', place.id)
      .run();
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlaces((prev) => prev.filter((p) => p.id !== place.id));
    if (focusedId === place.id) setFocusedId(null);

    if (queued) {
      toast.info('Removido localmente. Sincroniza quando voltar online.');
    } else {
      toast.success(
        isInItinerary
          ? 'Lugar removido do roteiro e dos lugares.'
          : 'Lugar removido.',
      );
    }
  }
  async function handleShare(place: Place) {
    const lines: string[] = [];
    lines.push(`📍 ${place.name}`);
    if (place.address) lines.push(place.address);

    if (place.latitude !== null && place.longitude !== null) {
      lines.push('');
      // URL universal do Google Maps que funciona em qualquer app
      lines.push(
        `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
      );
    }

    try {
      await Share.share({
        message: lines.join('\n'),
        // No iOS, title vira o subject de email
        title: place.name,
      });
    } catch (err) {
      // User cancelou ou erro do share — ignora silenciosamente
      if (Platform.OS === 'web') {
        toast.info('Compartilhamento não disponível no navegador.');
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.list}>
        <Skeleton height={280} borderRadius={radius.lg} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshProps} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <MapView
              markers={markers}
              focusedId={focusedId}
              onMarkerPress={setFocusedId}
            />
            <Button
              title="Adicionar lugar"
              variant="secondary"
              leftIcon={<Plus size={16} color={colors.text} />}
              onPress={() => setSearchOpen(true)}
            />
            {places.length > 0 && (
              <Text style={styles.sectionLabel}>
                {places.length} {places.length === 1 ? 'lugar salvo' : 'lugares salvos'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<MapPin size={36} color={colors.primary} />}
            title="Nenhum lugar salvo"
            description="Adicione restaurantes, pontos turísticos e outros locais para ver todos juntos no mapa."
            action={{
              label: 'Adicionar primeiro lugar',
              onPress: () => setSearchOpen(true),
            }}
          />
        }
        renderItem={({ item, index }) => (
          <FadeInView delay={getStaggerDelay(index, 40, 240)}>
            <PlaceRow
              place={item}
              isFocused={focusedId === item.id}
              onPress={() => setFocusedId(item.id)}
              onShare={() => handleShare(item)}
              onRemove={() => handleRemove(item)}
              onToggleVisited={() => toggleVisited(item)}
            />
          </FadeInView>
        )}
      />

      <PlaceSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handleAddPlace}
        tripContext={trip.title}
      />
      {/* Modal de storie de check-in */}
      {storiePlace && (
        <CheckInStorieModal
          place={storiePlace}
          tripTitle={trip.title}
          onClose={() => setStoriePlace(null)}
        />
      )}
    </>
  );
}

function PlaceRow({
  place,
  isFocused,
  onPress,
  onShare,
  onRemove,
  onToggleVisited,
}: {
  place: Place;
  isFocused: boolean;
  onPress: () => void;
  onShare: () => void;
  onRemove: () => void;
  onToggleVisited: () => void;
}) {
  const styles = useStyles();
  const [imgError, setImgError] = useState(false);
  const hasPhoto = !!(place as any).photo_url && !imgError;
  const neighborhood = (place as any).neighborhood as string | null;
  const categoryEmoji = CATEGORY_EMOJIS[place.category ?? ''] ?? '📍';

  return (
    <AnimatedPress
      onPress={onPress}
      pressScale={0.985}
      style={[styles.row, isFocused && styles.rowFocused]}
    >
      {/* Thumbnail foto ou emoji */}
      {hasPhoto ? (
        <Image
          source={{ uri: (place as any).photo_url }}
          style={[styles.thumb, isFocused && styles.thumbFocused]}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={[styles.iconBox, isFocused && styles.iconBoxFocused]}>
          <Text style={styles.categoryEmoji}>{categoryEmoji}</Text>
        </View>
      )}

      <View style={styles.rowContent}>
        <Text style={styles.rowName} numberOfLines={1}>
          {place.name}
        </Text>
        {/* Bairro em destaque */}
        {neighborhood && (
          <Text style={styles.rowNeighborhood} numberOfLines={1}>
            {neighborhood}
          </Text>
        )}
        {!!place.address && (
          <Text style={styles.rowAddress} numberOfLines={1}>
            {place.address}
          </Text>
        )}
        {place.category && !neighborhood && (
          <Text style={styles.rowCategory}>{translateCategory(place.category)}</Text>
        )}
        {place.visited && (
          <View style={styles.visitedBadge}>
            <Text style={styles.visitedBadgeText}>
              ✓ Visitado{place.visited_at ? ` · ${new Date(place.visited_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
            </Text>
          </View>
        )}
        {!place.latitude && (
          <View style={styles.warningRow}>
            <CircleAlert size={12} color={colors.warning} />
            <Text style={styles.rowWarning}>Sem coordenadas</Text>
          </View>
        )}
      </View>
      <Pressable onPress={onToggleVisited} hitSlop={20} style={[styles.actionBtn, place.visited && styles.visitedBtn]}>
        <Text style={styles.visitedIcon}>{place.visited ? '✅' : '⬜'}</Text>
      </Pressable>
      <Pressable onPress={onShare} hitSlop={8} style={styles.actionBtn}>
        <ShareIcon size={16} color={colors.textMuted} />
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </AnimatedPress>
  );
}

// ─── CheckIn Storie Modal ─────────────────────────────────────────────────────

function CheckInStorieModal({ place, tripTitle, onClose }: {
  place: Place;
  tripTitle: string;
  onClose: () => void;
}) {
  const storieRef = useRef<View>(null);
  const toast = useToast();
  const [photoUrl, setPhotoUrl] = useState<string | null>((place as any).photo_url ?? null);
  const [sharing, setSharing] = useState(false);

  // Busca foto do local se não tiver
  useEffect(() => {
    if (photoUrl) return;
    const name = place.name;
    const key = `${name} ${(place as any).neighborhood ?? ''}`.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
    if (!key) return;
    const PEXELS_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
    if (!PEXELS_KEY) return;
    fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(key + ' place travel')}&per_page=1&orientation=portrait`, {
      headers: { Authorization: PEXELS_KEY },
    }).then((r) => r.json()).then((data: any) => {
      const url = data?.photos?.[0]?.src?.portrait ?? data?.photos?.[0]?.src?.large2x;
      if (url) setPhotoUrl(url);
    }).catch(() => {});
  }, [place.name]);

  async function handleShare() {
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        await Share.share({ title: 'Trajet Check-in', message: `Estou em ${place.name}! 🚀 via Trajet` });
        return;
      }
      // Captura o card como imagem
      const uri = await captureRef(storieRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      // Salva na galeria e compartilha
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(uri);
        toast.success('Storie salvo na galeria!');
      }
      await Share.share({ url: uri, message: `Estou em ${place.name}! 🚀 usando Trajet` });
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        toast.error('Não foi possível compartilhar.');
      }
    } finally {
      setSharing(false);
    }
  }

  // Data do check-in
  const visitedAt = (place as any).visited_at
    ? new Date((place as any).visited_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={ss.backdrop}>
        {/* Card do storie — proporção 9:16 */}
        <View
          ref={storieRef}
          collapsable={false}
          style={ss.storieCard}
        >
          {/* Foto de fundo */}
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={ss.storiePhoto} resizeMode="cover" />
          ) : (
            <View style={[ss.storiePhoto, ss.storiePhotoFallback]} />
          )}

          {/* Overlay escuro gradiente */}
          <View style={ss.storieOverlay} />

          {/* Logo Trajet no topo */}
          <View style={ss.storieHeader}>
            <View style={ss.storieLogoWrap}>
              <Text style={ss.storieLogoText}>trajet</Text>
              <View style={ss.storieLogo3D} />
            </View>
          </View>

          {/* Moldura de canto — linhas decorativas */}
          <View style={[ss.cornerLine, ss.cornerTL]} />
          <View style={[ss.cornerLine, ss.cornerTLH]} />
          <View style={[ss.cornerLine, ss.cornerBR]} />
          <View style={[ss.cornerLine, ss.cornerBRH]} />

          {/* Conteúdo central */}
          <View style={ss.storieBody}>
            <Text style={ss.storieCheckIn}>CHECK-IN</Text>
            <Text style={ss.storiePlaceName} numberOfLines={3}>{place.name}</Text>
            {(place as any).neighborhood && (
              <Text style={ss.storieNeighborhood}>{(place as any).neighborhood}</Text>
            )}
            {place.address && (
              <Text style={ss.storieAddress} numberOfLines={2}>{place.address}</Text>
            )}
          </View>

          {/* Rodapé */}
          <View style={ss.storieFooter}>
            <View style={ss.storieFooterLine} />
            <View style={ss.storieFooterRow}>
              <Text style={ss.storieDate}>{visitedAt}</Text>
              <Text style={ss.storieTag}>🚀 Trajet</Text>
            </View>
          </View>
        </View>

        {/* Botões abaixo do card */}
        <View style={ss.actions}>
          <Pressable onPress={handleShare} disabled={sharing} style={ss.shareBtn}>
            <Text style={ss.shareBtnText}>{sharing ? 'Gerando...' : '↑ Compartilhar storie'}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={ss.closeBtn}>
            <Text style={ss.closeBtnText}>Fechar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const STORIE_W = 320;
const STORIE_H = STORIE_W * (16 / 9);
const BRAND_PURPLE = '#7b2fff';
const BRAND_BLUE = '#00b4ff';

const ss = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  storieCard: {
    width: STORIE_W, height: STORIE_H,
    borderRadius: 20, overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111',
    // Borda gradiente simulada
    borderWidth: 2.5,
    borderColor: BRAND_PURPLE,
    shadowColor: BRAND_PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 16,
  },
  storiePhoto: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  storiePhotoFallback: {
    backgroundColor: '#1a1033',
  },
  storieOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  // Logo
  storieHeader: {
    position: 'absolute', top: 28, left: 0, right: 0,
    alignItems: 'center',
  },
  storieLogoWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storieLogoText: {
    color: '#fff', fontSize: 18, fontWeight: '800',
    letterSpacing: -0.5,
  },
  storieLogo3D: {
    width: 18, height: 18, borderRadius: 4,
    backgroundColor: BRAND_PURPLE,
    transform: [{ rotate: '12deg' }],
  },
  // Moldura de cantos
  cornerLine: {
    position: 'absolute', backgroundColor: BRAND_BLUE,
  },
  cornerTL: { top: 14, left: 14, width: 2, height: 28 },
  cornerTLH: { top: 14, left: 14, width: 28, height: 2 },
  cornerBR: { bottom: 14, right: 14, width: 2, height: 28 },
  cornerBRH: { bottom: 14, right: 14, width: 28, height: 2 },
  // Conteúdo
  storieBody: {
    position: 'absolute', bottom: 80, left: 24, right: 24,
  },
  storieCheckIn: {
    color: BRAND_BLUE, fontSize: 11, fontWeight: '800',
    letterSpacing: 3, marginBottom: 8,
  },
  storiePlaceName: {
    color: '#fff', fontSize: 26, fontWeight: '800',
    letterSpacing: -0.8, lineHeight: 30,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  storieNeighborhood: {
    color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600',
    marginBottom: 4,
  },
  storieAddress: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11,
    lineHeight: 15,
  },
  // Rodapé
  storieFooter: {
    position: 'absolute', bottom: 20, left: 24, right: 24,
  },
  storieFooterLine: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 10,
  },
  storieFooterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  storieDate: {
    color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500',
  },
  storieTag: {
    color: '#fff', fontSize: 11, fontWeight: '700',
  },
  // Ações
  actions: { marginTop: 20, gap: 10, width: STORIE_W },
  shareBtn: {
    backgroundColor: BRAND_PURPLE, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: BRAND_PURPLE, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeBtn: {
    paddingVertical: 10, alignItems: 'center',
  },
  closeBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});


const CATEGORY_EMOJIS: Record<string, string> = {
  Restaurante: '🍽️', Café: '☕', Bar: '🍺', 'Fast food': '🍔',
  Hotel: '🏨', Hostel: '🛏️', Museu: '🏛️', Atração: '⭐',
  Mirante: '🌄', Parque: '🌳', Praia: '🏖️', Monumento: '🗿',
  Igreja: '⛪', Catedral: '⛪', Castelo: '🏰', Mercado: '🛒',
  Shopping: '🛍️', Supermercado: '🛒', Aeroporto: '✈️', Estação: '🚉',
  Rodoviária: '🚌',
};

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowFocused: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxFocused: { backgroundColor: colors.warningSoft },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    flexShrink: 0,
  },
  thumbFocused: { borderWidth: 2, borderColor: colors.warning },
  categoryEmoji: { fontSize: 22 },
  rowContent: { flex: 1, gap: 1 },
  rowName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  rowNeighborhood: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  rowAddress: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  rowCategory: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rowWarning: {
    color: colors.warning,
    fontSize: fontSize.xs,
  },
  visitedBtn: { backgroundColor: colors.successSoft, borderRadius: radius.sm },
  visitedIcon: { fontSize: 16 },
  visitedBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  visitedBadgeText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}), [themeVersion]);
}
