import { useLocalSearchParams, useRouter } from 'expo-router';
import {useEffect, useState, useMemo } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { FadeInView } from '@/components/FadeInView';
import {
  Camera,
  Compass,
  Hotel,
  ListChecks,
  LogOut,
  MapPin,
  Trash,
  Wallet,
} from '@/components/Icon';
import { Input } from '@/components/Input';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { shareTemplateToGallery } from '@/lib/itineraryTemplates';
import { useCoverPhoto } from '@/hooks/useCoverPhoto';
import { uploadCoverPhoto } from '@/lib/coverUpload';
import { datesBetween } from '@/lib/dates';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { type CurrencyCode } from '@/lib/expenses';
import { supabase, type Trip } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

export default function EditTripScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasExpenses, setHasExpenses] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [features, setFeatures] = useState({
    itinerary: true,
    lodging: true,
    places: true,
    expenses: true,
    tasks: true,
  });
  const [uploadingCover, setUploadingCover] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    async function load() {
      const [tripResult, expenseCountResult] = await Promise.all([
        supabase.from('trips').select('*').eq('id', id).single(),
        supabase
          .from('expenses')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', id),
      ]);

      if (!mounted) return;

      if (tripResult.error || !tripResult.data) {
        toast.error('Viagem não encontrada.');
        router.back();
        return;
      }
      const t = tripResult.data;
      setTrip(t);
      setTitle(t.title);
      setDescription(t.description ?? '');
      setStartDate(t.start_date);
      setEndDate(t.end_date);
      setBaseCurrency(t.base_currency);
      setCoverUrl(t.cover_image_url);
      setFeatures({
        itinerary: t.feature_itinerary !== false,
        lodging: t.feature_lodging !== false,
        places: t.feature_places !== false,
        expenses: t.feature_expenses !== false,
        tasks: t.feature_tasks !== false,
      });
      setHasExpenses((expenseCountResult.count ?? 0) > 0);
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const isOwner = user?.id === trip?.owner_id;

  async function handleSave() {
    if (!trip) return;
    if (!title.trim()) {
      toast.error('Dê um nome para a viagem.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      toast.error('A data final precisa ser depois da inicial.');
      return;
    }
    if (hasExpenses && baseCurrency !== trip.base_currency) {
      toast.error('Não dá pra mudar a moeda quando já há despesas registradas.');
      return;
    }
    if (!Object.values(features).some((v) => v)) {
      toast.error('Ative pelo menos um recurso na viagem.');
      return;
    }

    setSaving(true);

    // Atualiza a viagem
    const { error: updateError } = await supabase
      .from('trips')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        base_currency: baseCurrency,
        cover_image_url: coverUrl,
        feature_itinerary: features.itinerary,
        feature_lodging: features.lodging,
        feature_places: features.places,
        feature_expenses: features.expenses,
        feature_tasks: features.tasks,
      })
      .eq('id', trip.id);

    if (updateError) {
      setSaving(false);
      toast.error(updateError.message);
      return;
    }

    // Sincroniza trip_days se as datas mudaram
    const datesChanged =
      trip.start_date !== startDate || trip.end_date !== endDate;
    if (datesChanged) {
      await syncTripDays(trip.id, startDate, endDate);
    }

    setSaving(false);
    toast.success('Viagem atualizada.');
    router.back();
  }

  async function handlePickCover() {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Precisamos de permissão pra acessar sua galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingCover(true);
    const { publicUrl, error } = await uploadCoverPhoto(
      user.id,
      asset.uri,
      asset.mimeType ?? 'image/jpeg',
      trip?.id
    );
    setUploadingCover(false);

    if (error || !publicUrl) {
      toast.error(error ?? 'Erro ao subir foto.');
      return;
    }
    setCoverUrl(publicUrl);
    toast.success('Capa atualizada (lembre de salvar).');
  }

  function handleResetCover() {
    setCoverUrl(null);
    toast.info('Capa removida (vai usar a sugestão automática).');
  }

  async function handleDelete() {
    if (!trip) return;
    Alert.alert(
      'Excluir viagem?',
      `"${trip.title}" e tudo dentro (roteiro, lugares, despesas, tarefas) serão apagados pra sempre.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_trip', {
              _trip_id: trip.id,
            });
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success('Viagem excluída.');
            // Volta pra Home (sai da tela atual e da tela do detalhe da viagem)
            router.dismissAll?.();
            router.replace('/(app)');
          },
        },
      ]
    );
  }

  async function handleLeaveTrip() {
    if (!trip || !user) return;
    Alert.alert(
      'Sair desta viagem?',
      'Você vai parar de ver e editar essa viagem. Pra voltar, peça outro convite.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('trip_members')
              .delete()
              .eq('trip_id', trip.id)
              .eq('profile_id', user.id);
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success('Você saiu da viagem.');
            router.dismissAll?.();
            router.replace('/(app)');
          },
        },
      ]
    );
  }

  // Hook chamado SEMPRE (antes de qualquer early return) pra preservar ordem.
  // Passamos fallback pro título caso `trip` ainda não tenha carregado.
  const displayCoverUrl = useCoverPhoto(title || trip?.title || '', coverUrl);
  const isCustomCover = !!coverUrl;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <Skeleton height={48} borderRadius={radius.md} />
          <View style={{ height: spacing.md }} />
          <Skeleton height={80} borderRadius={radius.md} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* HERO da capa */}
          <FadeInView>
            <View style={styles.coverHero}>
              {displayCoverUrl ? (
                <Image
                  source={{ uri: displayCoverUrl }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.coverImage, styles.coverPlaceholder]} />
              )}
              <View style={[styles.coverOverlay, { backgroundColor: 'rgba(10,14,26,0.6)' }]} />
              <View style={styles.coverActions}>
                <AnimatedPress
                  onPress={handlePickCover}
                  pressScale={0.96}
                  style={styles.coverBtn}
                >
                  <Camera size={14} color="#fff" />
                  <Text style={styles.coverBtnText}>
                    {uploadingCover ? 'Enviando…' : isCustomCover ? 'Trocar' : 'Subir capa'}
                  </Text>
                </AnimatedPress>
                {isCustomCover && (
                  <AnimatedPress
                    onPress={handleResetCover}
                    pressScale={0.96}
                    style={styles.coverBtnGhost}
                  >
                    <Text style={styles.coverBtnGhostText}>Remover</Text>
                  </AnimatedPress>
                )}
              </View>
              {!isCustomCover && (
                <View style={styles.coverHint}>
                  <Text style={styles.coverHintText}>
                    Capa automática · suba a sua se quiser
                  </Text>
                </View>
              )}
            </View>
          </FadeInView>

          <FadeInView delay={60}>
            <SectionHeader title="Informações" style={styles.sectionHeader} />
            <View style={styles.form}>
              <Input
                label="Título"
                value={title}
                onChangeText={setTitle}
                placeholder="Ex: Lisboa em outubro"
                autoCapitalize="sentences"
              />
              <Input
                label="Descrição (opcional)"
                value={description}
                onChangeText={setDescription}
                placeholder="O que essa viagem é pra você?"
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <DateField
                    label="Data de início"
                    value={startDate}
                    onChange={setStartDate}
                    optional
                  />
                </View>
                <View style={styles.dateField}>
                  <DateField
                    label="Data de fim"
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate}
                    optional
                  />
                </View>
              </View>

              <View>
                {hasExpenses ? (
                  <>
                    <Text style={styles.fieldLabel}>Moeda-base</Text>
                    <View style={styles.currencyLocked}>
                      <Text style={styles.currencyLockedText}>
                        {baseCurrency}
                      </Text>
                      <Text style={styles.currencyHint}>
                        Não dá pra mudar — já há despesas registradas.
                      </Text>
                    </View>
                  </>
                ) : (
                  <CurrencyPicker
                    label="Moeda-base"
                    value={baseCurrency as CurrencyCode}
                    onChange={(code) => setBaseCurrency(code)}
                    variant="block"
                  />
                )}
              </View>
            </View>
          </FadeInView>

          {/* RECURSOS */}
          <FadeInView delay={120}>
            <SectionHeader title="Recursos" style={styles.sectionHeader} />
            <Text style={styles.sectionHint}>
              Ative só o que vai usar nessa viagem. Abas desativadas somem do
              menu mas os dados ficam preservados.
            </Text>
            <View style={styles.featuresCard}>
              <FeatureRow
                Icon={Compass}
                title="Roteiro por dia"
                value={features.itinerary}
                onChange={(v) => setFeatures({ ...features, itinerary: v })}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                Icon={Hotel}
                title="Hospedagem"
                value={features.lodging}
                onChange={(v) => setFeatures({ ...features, lodging: v })}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                Icon={MapPin}
                title="Mapa de lugares"
                value={features.places}
                onChange={(v) => setFeatures({ ...features, places: v })}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                Icon={Wallet}
                title="Despesas"
                value={features.expenses}
                onChange={(v) => setFeatures({ ...features, expenses: v })}
              />
              <View style={styles.featureDivider} />
              <FeatureRow
                Icon={ListChecks}
                title="Tarefas"
                value={features.tasks}
                onChange={(v) => setFeatures({ ...features, tasks: v })}
              />
            </View>
          </FadeInView>

          <FadeInView delay={160}>
            {/* Compartilhar roteiro na galeria */}
            <View style={styles.gallerySection}>
              <Text style={styles.gallerySectionTitle}>🗺️ Galeria de roteiros</Text>
              <Text style={styles.gallerySectionDesc}>
                Compartilhe o modelo de roteiro desta viagem com outros usuários do Trajet.
              </Text>
              <Button
                title="Compartilhar roteiro na galeria"
                variant="secondary"
                onPress={() => {
                  Alert.alert(
                    'Compartilhar roteiro',
                    'O modelo de roteiro desta viagem ficará visível para todos os usuários do Trajet na galeria de roteiros. Os nomes dos locais serão compartilhados, mas não seus dados pessoais.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Compartilhar',
                        onPress: async () => {
                          if (!user?.id || !trip) return;
                          try {
                            // Busca dias e itens do roteiro
                            const { data: days } = await supabase
                              .from('trip_days')
                              .select('id, day_date')
                              .eq('trip_id', trip.id)
                              .order('day_date');

                            if (!days?.length) {
                              toast.error('Adicione itens ao roteiro antes de compartilhar.');
                              return;
                            }

                            // Cria estrutura ResolvedDay simplificada
                            const resolved = days.map((d: any, i: number) => ({
                              dayNumber: i + 1,
                              title: `Dia ${i + 1}`,
                              summary: null,
                              items: [],
                              date: d.day_date,
                            }));

                            await shareTemplateToGallery(
                              trip.title,
                              resolved as any,
                              user.id,
                            );
                            toast.success('Roteiro compartilhado na galeria!');
                          } catch {
                            toast.error('Não foi possível compartilhar. Tente de novo.');
                          }
                        },
                      },
                    ]
                  );
                }}
              />
            </View>
          </FadeInView>

          <FadeInView delay={180}>
            <Button
              title="Salvar mudanças"
              onPress={handleSave}
              loading={saving}
              style={styles.saveBtn}
            />
          </FadeInView>

          {/* Zona perigosa */}
          <FadeInView delay={200}>
            <View style={styles.dangerSection}>
              <Text style={styles.dangerLabel}>Zona perigosa</Text>

              {!isOwner && (
                <AnimatedPress
                  style={styles.dangerRow}
                  pressScale={0.99}
                  onPress={handleLeaveTrip}
                >
                  <View style={[styles.iconWrap, styles.warnIcon]}>
                    <LogOut size={18} color={colors.warning} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>Sair desta viagem</Text>
                    <Text style={styles.rowHint}>
                      Você não é o dono. Pode sair sem afetar os outros.
                    </Text>
                  </View>
                </AnimatedPress>
              )}

              {isOwner && (
                <AnimatedPress
                  style={styles.dangerRowDestructive}
                  pressScale={0.99}
                  onPress={handleDelete}
                >
                  <View style={[styles.iconWrap, styles.dangerIcon]}>
                    <Trash size={18} color={colors.danger} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabelDanger}>Excluir viagem</Text>
                    <Text style={styles.rowHint}>
                      Apaga roteiro, lugares, despesas e tarefas.
                    </Text>
                  </View>
                </AnimatedPress>
              )}
            </View>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Linha de toggle de recurso. Compacta, com ícone à esquerda e Switch à direita.
 */
function FeatureRow({
  Icon,
  title,
  value,
  onChange,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIcon, value && styles.featureIconActive]}>
        <Icon size={16} color={value ? colors.primary : colors.textMuted} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

/**
 * Sincroniza trip_days com as novas datas da viagem.
 * - Apaga dias fora do range novo (e os itens do roteiro neles, via cascade)
 * - Cria dias que faltam dentro do range novo
 * - Mantém os dias existentes que ainda fazem sentido (preserva itens)
 */
async function syncTripDays(
  tripId: string,
  startDate: string | null,
  endDate: string | null
) {
  // Se não tem ambas datas, apaga todos os dias (vamos esperar o user definir datas)
  if (!startDate || !endDate) {
    await supabase.from('trip_days').delete().eq('trip_id', tripId);
    return;
  }

  // Pega dias atuais
  const { data: existing } = await supabase
    .from('trip_days')
    .select('id, day_date')
    .eq('trip_id', tripId);

  const existingDates = new Set((existing ?? []).map((d) => d.day_date));
  const newDates = datesBetween(startDate, endDate);
  const newDateSet = new Set(newDates);

  // Apaga os que saíram do range
  const toDelete = (existing ?? [])
    .filter((d) => !newDateSet.has(d.day_date))
    .map((d) => d.id);
  if (toDelete.length > 0) {
    await supabase.from('trip_days').delete().in('id', toDelete);
  }

  // Cria os novos
  const toInsert = newDates
    .filter((d) => !existingDates.has(d))
    .map((day_date, idx) => ({
      trip_id: tripId,
      day_date,
      position: idx,
    }));
  if (toInsert.length > 0) {
    await supabase.from('trip_days').insert(toInsert);
  }
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  // HERO da capa
  coverHero: {
    height: 200,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
    ...shadow.md,
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { backgroundColor: colors.surfaceAlt },
  coverOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  coverActions: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  coverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  coverBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  coverBtnGhost: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  coverBtnGhostText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  coverHint: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  coverHintText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: fontSize.xs,
    fontWeight: '500',
    letterSpacing: letterSpacing.wide,
  },
  // SECTIONS
  sectionHeader: {
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  // FEATURES
  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconActive: {
    backgroundColor: colors.primarySoft,
  },
  featureTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  featureDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: spacing.md + 32 + spacing.md,
  },
  form: { gap: spacing.md },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: { flex: 1 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chipTextActive: { color: colors.primaryTextOnSolid, fontWeight: '600' },
  currencyLocked: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyLockedText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  currencyHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  saveBtn: { marginTop: spacing.md },
  gallerySection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  gallerySectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  gallerySectionDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  dangerSection: {
    gap: spacing.sm,
  },
  dangerLabel: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  dangerRowDestructive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnIcon: { backgroundColor: colors.warningSoft },
  dangerIcon: { backgroundColor: colors.dangerSoft },
  rowContent: { flex: 1 },
  rowLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowLabelDanger: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
}), [themeVersion]);
}
