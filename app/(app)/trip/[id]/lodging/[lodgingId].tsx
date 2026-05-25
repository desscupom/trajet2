import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {useCallback, useEffect, useState, useMemo } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { FadeInView } from '@/components/FadeInView';
import {
  Edit,
  Globe,
  KeyRound,
  MapPin,
  Moon,
  Phone,
  Share as ShareIcon,
  Star,
  Wallet,
  Wifi,
} from '@/components/Icon';
import { LODGING_KIND_ICONS } from '@/components/lodgingIcons';
import { MapView } from '@/components/MapView';
import { LodgingModal } from '@/components/trip/LodgingModal';
import { useToast } from '@/components/Toast';
import {
  formatLodgingDateTime,
  getLodgingStatus,
  getNights,
  LODGING_KIND_LABELS,
  type Lodging,
} from '@/lib/lodgings';
import { supabase } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

const AMENITY_LABELS: Record<string, { label: string; emoji: string }> = {
  wifi: { label: 'Wi-Fi', emoji: '📶' },
  breakfast: { label: 'Café da manhã', emoji: '🍳' },
  parking: { label: 'Estacionamento', emoji: '🅿️' },
  pool: { label: 'Piscina', emoji: '🏊' },
  gym: { label: 'Academia', emoji: '💪' },
  ac: { label: 'Ar condicionado', emoji: '❄️' },
  pets: { label: 'Pets permitidos', emoji: '🐶' },
  kitchen: { label: 'Cozinha', emoji: '🍴' },
  tv: { label: 'TV', emoji: '📺' },
  washer: { label: 'Lavanderia', emoji: '🧺' },
};

export default function LodgingDetailScreen() {
  const styles = useStyles();
  const { id: tripId, lodgingId } = useLocalSearchParams<{
    id: string;
    lodgingId: string;
  }>();
  const router = useRouter();
  const toast = useToast();

  const [lodging, setLodging] = useState<Lodging | null>(null);
  const [tripData, setTripData] = useState<{ base_currency: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [ratingHover, setRatingHover] = useState<number | null>(null);

  const fetch = useCallback(async () => {
    const [{ data: l }, { data: t }] = await Promise.all([
      supabase.from('lodgings').select('*').eq('id', lodgingId).single(),
      supabase.from('trips').select('base_currency, title').eq('id', tripId).single(),
    ]);
    if (l) setLodging(l as Lodging);
    if (t) setTripData(t as { base_currency: string; title: string });
    setLoading(false);
  }, [lodgingId, tripId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function setRating(value: number) {
    if (!lodging) return;
    await supabase
      .from('lodgings')
      .update({ rating: value })
      .eq('id', lodging.id);
    setLodging((prev) => prev ? { ...prev, rating: value } : prev);
    toast.success('Avaliação salva!');
  }

  async function handleDelete() {
    if (!lodging) return;
    Alert.alert('Deletar hospedagem?', lodging.name, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('lodgings').delete().eq('id', lodging.id);
          router.back();
          toast.success('Hospedagem removida.');
        },
      },
    ]);
  }

  if (loading || !lodging) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <SafeAreaView style={styles.safe} edges={['bottom']} />
      </>
    );
  }

  const status = getLodgingStatus(lodging);
  const nights = getNights(lodging);
  const Icon = LODGING_KIND_ICONS[(lodging.kind as keyof typeof LODGING_KIND_ICONS) ?? 'other'];
  const displayRating = ratingHover ?? lodging.rating ?? 0;

  const hasMap = lodging.latitude != null && lodging.longitude != null;
  const amenities = (lodging.amenities ?? []) as string[];

  const statusConfig = {
    upcoming: { label: 'Próxima', color: colors.primary, bg: colors.primarySoft },
    current: { label: 'Em andamento', color: colors.success, bg: colors.successSoft },
    past: { label: 'Concluída', color: colors.textMuted, bg: colors.surfaceAlt },
    undated: { label: 'Sem datas', color: colors.textMuted, bg: colors.surfaceAlt },
  }[status];

  return (
    <>
      <Stack.Screen
        options={{
          title: lodging.name,
          headerRight: () => (
            <Pressable
              onPress={() => setEditOpen(true)}
              hitSlop={12}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Edit size={18} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <FadeInView>
            {/* ── Card principal: Hero + Datas + Ações ────────────── */}
            <View style={styles.mainCard}>
              <View style={styles.hero}>
                <View style={styles.heroIconWrap}>
                  <Icon size={28} color={colors.primary} />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.kindLabel}>
                    {LODGING_KIND_LABELS[lodging.kind as keyof typeof LODGING_KIND_LABELS] ?? 'Hospedagem'}
                  </Text>
                  <Text style={styles.heroTitle} numberOfLines={3}>
                    {lodging.name}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                  <Text style={[styles.statusText, { color: statusConfig.color }]}>
                    {statusConfig.label}
                  </Text>
                </View>
              </View>

              {(lodging.check_in_at || lodging.check_out_at) && (
                <>
                  <View style={styles.cardDivider} />
                  <View style={styles.datesRow}>
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateLabel}>CHECK-IN</Text>
                      <Text style={styles.dateValue}>
                        {lodging.check_in_at ? formatLodgingDateTime(lodging.check_in_at) : '—'}
                      </Text>
                    </View>
                    <View style={styles.dateArrow}>
                      <Moon size={16} color={colors.primary} />
                      {nights > 0 && (
                        <Text style={styles.nightsText}>{nights} {nights === 1 ? 'noite' : 'noites'}</Text>
                      )}
                    </View>
                    <View style={[styles.dateBlock, { alignItems: 'flex-end' }]}>
                      <Text style={styles.dateLabel}>CHECK-OUT</Text>
                      <Text style={styles.dateValue}>
                        {lodging.check_out_at ? formatLodgingDateTime(lodging.check_out_at) : '—'}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.cardDivider} />
              <View style={styles.quickActions}>
                {lodging.phone && (
                  <AnimatedPress onPress={() => Linking.openURL(`tel:${lodging.phone}`)} style={styles.quickBtn} pressScale={0.92}>
                    <Phone size={20} color={colors.primary} /><Text style={styles.quickLabel}>Ligar</Text>
                  </AnimatedPress>
                )}
                {lodging.website && (
                  <AnimatedPress onPress={() => Linking.openURL(lodging.website!.startsWith('http') ? lodging.website! : `https://${lodging.website}`)} style={styles.quickBtn} pressScale={0.92}>
                    <Globe size={20} color={colors.primary} /><Text style={styles.quickLabel}>Site</Text>
                  </AnimatedPress>
                )}
                {hasMap && (
                  <AnimatedPress onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lodging.latitude},${lodging.longitude}`)} style={styles.quickBtn} pressScale={0.92}>
                    <MapPin size={20} color={colors.primary} /><Text style={styles.quickLabel}>Maps</Text>
                  </AnimatedPress>
                )}
                {lodging.wifi_password && (
                  <AnimatedPress onPress={async () => { await Clipboard.setStringAsync(lodging.wifi_password!); toast.success('Senha copiada!'); }} style={styles.quickBtn} pressScale={0.92}>
                    <Wifi size={20} color={colors.primary} /><Text style={styles.quickLabel}>Wi-Fi</Text>
                  </AnimatedPress>
                )}
                <AnimatedPress onPress={() => Share.share({ message: `${lodging.name}\n${lodging.address ?? ''}\nCheck-in: ${lodging.check_in_at ? formatLodgingDateTime(lodging.check_in_at) : '—'}`, title: lodging.name })} style={styles.quickBtn} pressScale={0.92}>
                  <ShareIcon size={20} color={colors.primary} /><Text style={styles.quickLabel}>Compartilhar</Text>
                </AnimatedPress>
              </View>
            </View>

            {/* ── Resumo rápido de informações visível sem rolar ── */}
            {(lodging.reservation_code || lodging.phone || lodging.website || lodging.wifi_password || lodging.cost_amount) && (
              <View style={styles.quickInfoBar}>
                {lodging.reservation_code && (
                  <View style={styles.quickInfoItem}>
                    <Text style={styles.quickInfoLabel}>RESERVA</Text>
                    <Text style={styles.quickInfoValue} numberOfLines={1}>{lodging.reservation_code}</Text>
                  </View>
                )}
                {lodging.cost_amount && lodging.cost_currency && (
                  <View style={styles.quickInfoItem}>
                    <Text style={styles.quickInfoLabel}>CUSTO</Text>
                    <Text style={styles.quickInfoValue}>{lodging.cost_currency} {lodging.cost_amount.toFixed(0)}</Text>
                  </View>
                )}
                {lodging.wifi_password && (
                  <AnimatedPress onPress={async () => { await Clipboard.setStringAsync(lodging.wifi_password!); toast.success('Senha copiada!'); }} style={styles.quickInfoItem} pressScale={0.97}>
                    <Text style={styles.quickInfoLabel}>WI-FI</Text>
                    <Text style={styles.quickInfoValue} numberOfLines={1}>Toque para copiar</Text>
                  </AnimatedPress>
                )}
                {lodging.phone && (
                  <AnimatedPress onPress={() => Linking.openURL(`tel:${lodging.phone}`)} style={styles.quickInfoItem} pressScale={0.97}>
                    <Text style={styles.quickInfoLabel}>TELEFONE</Text>
                    <Text style={styles.quickInfoValue} numberOfLines={1}>{lodging.phone}</Text>
                  </AnimatedPress>
                )}
              </View>
            )}
            {/* Endereço — sempre visível quando disponível */}
            {lodging.address && (
              <View style={styles.mapCard}>
                <View style={styles.addressRow}>
                  <MapPin size={13} color={colors.textMuted} />
                  <Text style={[styles.addressText, { flex: 1 }]}>{lodging.address}</Text>
                </View>
                {hasMap && (
                  <View style={styles.mapWrap}>
                    <MapView markers={[{ id: lodging.id, title: lodging.name, latitude: lodging.latitude!, longitude: lodging.longitude! }]} height={200} />
                  </View>
                )}
              </View>
            )}
            {!lodging.address && hasMap && (
              <View style={styles.mapCard}>
                <View style={styles.mapWrap}>
                  <MapView markers={[{ id: lodging.id, title: lodging.name, latitude: lodging.latitude!, longitude: lodging.longitude! }]} height={200} />
                </View>
              </View>
            )}

            {/* ── Informações + Comodidades + Notas ────────────────── */}
            {(lodging.reservation_code || lodging.cost_amount || lodging.phone || lodging.website || lodging.wifi_password || amenities.length > 0 || lodging.notes) && (
              <View style={styles.mainCard}>
                {(lodging.reservation_code || lodging.cost_amount || lodging.phone || lodging.website || lodging.wifi_password) && (
                  <>
                    <Text style={styles.sectionTitle}>INFORMAÇÕES</Text>
                    <View style={styles.infoGrid}>
                      {lodging.reservation_code && (
                        <InfoRow icon={<KeyRound size={14} color={colors.primary} />} label="Código de reserva" value={lodging.reservation_code} onCopy={async () => { await Clipboard.setStringAsync(lodging.reservation_code!); toast.success('Código copiado!'); }} />
                      )}
                      {lodging.cost_amount && lodging.cost_currency && (
                        <InfoRow icon={<Wallet size={14} color={colors.primary} />} label="Custo total" value={`${lodging.cost_currency} ${lodging.cost_amount.toFixed(2)}`} />
                      )}
                      {lodging.phone && (
                        <InfoRow icon={<Phone size={14} color={colors.primary} />} label="Telefone" value={lodging.phone} onPress={() => Linking.openURL(`tel:${lodging.phone}`)} />
                      )}
                      {lodging.website && (
                        <InfoRow icon={<Globe size={14} color={colors.primary} />} label="Site" value={lodging.website} onPress={() => Linking.openURL(lodging.website!.startsWith('http') ? lodging.website! : `https://${lodging.website}`)} />
                      )}
                      {lodging.wifi_password && (
                        <InfoRow icon={<Wifi size={14} color={colors.primary} />} label="Senha Wi-Fi" value={lodging.wifi_password} onCopy={async () => { await Clipboard.setStringAsync(lodging.wifi_password!); toast.success('Senha copiada!'); }} secret />
                      )}
                    </View>
                  </>
                )}
                {amenities.length > 0 && (
                  <>
                    {(lodging.reservation_code || lodging.cost_amount || lodging.wifi_password) && <View style={styles.cardDivider} />}
                    <Text style={styles.sectionTitle}>COMODIDADES</Text>
                    <View style={styles.amenitiesRow}>
                      {amenities.map((a) => {
                        const info = AMENITY_LABELS[a] ?? { label: a, emoji: '✓' };
                        return (
                          <View key={a} style={styles.amenityChip}>
                            <Text style={styles.amenityEmoji}>{info.emoji}</Text>
                            <Text style={styles.amenityLabel}>{info.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
                {lodging.notes && (
                  <>
                    <View style={styles.cardDivider} />
                    <Text style={styles.sectionTitle}>OBSERVAÇÕES</Text>
                    <Text style={styles.notesText}>{lodging.notes}</Text>
                  </>
                )}
              </View>
            )}

            {/* ── Avaliação ────────────────────────────────────────── */}
            {(status === 'past' || status === 'current') && (
              <View style={styles.mainCard}>
                <Text style={styles.sectionTitle}>SUA AVALIAÇÃO</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable key={star} onPress={() => setRating(star)} onPressIn={() => setRatingHover(star)} onPressOut={() => setRatingHover(null)} hitSlop={6}>
                      <Star size={32} color={star <= displayRating ? '#f59e0b' : colors.border} />
                    </Pressable>
                  ))}
                </View>
                {lodging.rating && (
                  <Text style={styles.ratingHint}>
                    {['', 'Péssimo 😤', 'Ruim 😕', 'Ok 😐', 'Bom 😊', 'Excelente! 🤩'][lodging.rating]}
                  </Text>
                )}
                {lodging.review && (
                  <View style={styles.reviewBox}>
                    <Text style={styles.reviewText}>{lodging.review}</Text>
                  </View>
                )}
              </View>
            )}

            <Button title="Remover hospedagem" variant="danger" onPress={handleDelete} fullWidth style={{ marginTop: spacing.xs }} />
          </FadeInView>
        </ScrollView>
      </SafeAreaView>

      {editOpen && (
        <LodgingModal
          visible={editOpen}
          tripId={tripId}
          tripBaseCurrency={tripData?.base_currency ?? 'BRL'}
          tripTitle={tripData?.title ?? ''}
          lodging={lodging}
          onClose={() => {
            setEditOpen(false);
            fetch();
          }}
        />
      )}
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onCopy,
  onPress,
  secret,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy?: () => void;
  onPress?: () => void;
  secret?: boolean;
}) {
  const styles = useStyles();
  const [revealed, setRevealed] = useState(!secret);
  const displayValue = secret && !revealed ? '••••••••' : value;

  return (
    <Pressable
      style={styles.infoRow}
      onPress={onPress ?? (secret ? () => setRevealed((v) => !v) : onCopy)}
      onLongPress={onCopy}
    >
      <View style={styles.infoIconWrap}>{icon}</View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text
          style={[styles.infoValue, onPress && { color: colors.primary }]}
          numberOfLines={2}
        >
          {displayValue}
        </Text>
      </View>
      {(onCopy || secret) && (
        <Text style={styles.infoCopyHint}>
          {secret && !revealed ? 'toque pra revelar' : onCopy ? 'segure pra copiar' : ''}
        </Text>
      )}
    </Pressable>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.md,
  },
  quickInfoBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  quickInfoItem: {
    minWidth: '45%',
    flex: 1,
    gap: 2,
  },
  quickInfoLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  quickInfoValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadow.md,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: -spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  heroText: { flex: 1 },
  kindLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tighter,
    lineHeight: 26,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBlock: { flex: 1 },
  dateLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dateArrow: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  nightsText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  quickBtn: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  quickLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  addressText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  mapWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  infoGrid: { gap: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primarySofter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  infoCopyHint: {
    color: colors.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amenityEmoji: { fontSize: 14 },
  amenityLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  notesText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  ratingHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  reviewBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  reviewText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 22,
    fontStyle: 'italic',
  },
}), [themeVersion]);
}
