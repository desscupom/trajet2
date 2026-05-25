import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { useAIConsent } from '@/components/AIConsentModal';
import { Sparkles, X } from '@/components/Icon';
import { Input } from '@/components/Input';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { toDbDate } from '@/lib/dates';
import {
  generateItinerarySuggestion,
  type SuggestedDay,
  type SuggestionInput,
  type SuggestionPace,
  type SuggestionStyle,
} from '@/lib/itinerarySuggester';
import {
  resolveSuggestedDays,
  type ResolvedSuggestedItem,
} from '@/lib/itinerarySuggesterResolve';
import {
  bumpTemplateReuse,
  findMatchingTemplate,
  saveTemplate,
  shareTemplateToGallery,
} from '@/lib/itineraryTemplates';
import * as Notifications from 'expo-notifications';
import { analyzeMultiplePlaces } from '@/lib/safetyAnalyzer';
import { supabase, type Trip } from '@/lib/supabase';
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
  visible: boolean;
  onClose: () => void;
  onApplied: () => void;
};

type Stage = 'form' | 'generating' | 'preview' | 'applying';

type ResolvedDay = Omit<SuggestedDay, 'items'> & {
  items: ResolvedSuggestedItem[];
};

const STYLE_OPTIONS: { value: SuggestionStyle; label: string; emoji: string }[] = [
  { value: 'tourist', label: 'Turístico', emoji: '🗺️' },
  { value: 'gastronomic', label: 'Gastronômico', emoji: '🍽️' },
  { value: 'cultural', label: 'Cultural', emoji: '🎨' },
  { value: 'romantic', label: 'Romântico', emoji: '💕' },
  { value: 'family', label: 'Família', emoji: '👨‍👩‍👧' },
  { value: 'adventure', label: 'Aventura', emoji: '⛰️' },
];

const PACE_OPTIONS: { value: SuggestionPace; label: string; hint: string }[] = [
  { value: 'relaxed',  label: 'Tranquilo',    hint: '2-3 lugares por dia' },
  { value: 'balanced', label: 'Equilibrado',  hint: '3-4 lugares por dia' },
  { value: 'intense',  label: 'Intenso',      hint: '5-6 lugares por dia' },
];

/**
 * Modal pra gerar roteiro com IA.
 *
 * Fluxo:
 * 1. Form — destino, dias, estilo, ritmo, observações
 * 2. Generating — IA processa (~10s)
 * 3. Preview — mostra dias e lugares, user pode revisar
 *    No bg: resolve cada lugar via OSM/Nominatim (com rate limit)
 * 4. Applying — cria trip_days, places, itinerary_items no Supabase
 *
 * Observações importantes:
 * - Resolução de lugares é lenta (1.1s por lugar pra cumprir TOS do OSM).
 *   Pra 5 dias × 4 lugares = ~22s. Mostramos progress bar.
 * - Lugares que não resolvem entram como `custom_title` (sem coordenadas).
 *   User vê no preview e pode remover se quiser.
 */
export function SuggestItineraryModal({
  trip,
  visible,
  onClose,
  onApplied,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const { requestConsent, consentModal } = useAIConsent();

  // ----- Form state -----
  const [destination, setDestination] = useState(trip.title);
  const [days, setDays] = useState(String(computeDefaultDays(trip)));
  const [selectedStyles, setSelectedStyles] = useState<SuggestionStyle[]>(['tourist']);
  const [pace, setPace] = useState<SuggestionPace>('balanced');
  const [notes, setNotes] = useState('');

  function toggleStyle(s: SuggestionStyle) {
    setSelectedStyles((prev) =>
      prev.includes(s)
        ? prev.length > 1 ? prev.filter((x) => x !== s) : prev // mínimo 1
        : [...prev, s]
    );
  }

  // Refs pra scroll automático quando teclado abre no notes
  const scrollRef = useRef<ScrollView>(null);
  const notesYRef = useRef(0);

  // ----- Generation state -----
  const [stage, setStage] = useState<Stage>('form');
  const [suggestion, setSuggestion] = useState<ResolvedDay[] | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [wantShareGallery, setWantShareGallery] = useState(false);
  /** Marca se o roteiro veio do cache (template) — pra mostrar badge */
  const [usedCachedTemplate, setUsedCachedTemplate] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setDestination(trip.title);
      setDays(String(computeDefaultDays(trip)));
      setSelectedStyles(['tourist']);
      setPace('balanced');
      setNotes('');
      setStage('form');
      setSuggestion(null);
      setResolveProgress(null);
      setMinimized(false);
      setUsedCachedTemplate(false);
    }
  }, [visible, trip]);

  // Quando terminar de gerar e estiver minimizado, manda notificação
  useEffect(() => {
    if (stage === 'preview' && minimized) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ Roteiro pronto!',
          body: `O roteiro de ${destination} foi gerado. Toque para revisar.`,
          sound: true,
        },
        trigger: null, // imediato
      }).catch(() => {});
      setMinimized(false);
    }
  }, [stage, minimized, destination]);

  const daysNumber = useMemo(() => {
    const n = parseInt(days, 10);
    return isNaN(n) ? 0 : n;
  }, [days]);

  async function handleGenerate() {
    if (!destination.trim()) {
      toast.error('Informe o destino.');
      return;
    }
    if (daysNumber < 1 || daysNumber > 90) {
      toast.error('Número de dias deve ser entre 1 e 90.');
      return;
    }

    setStage('generating');
    setResolveProgress(null);

    const input: SuggestionInput = {
      destination: destination.trim(),
      days: daysNumber,
      style: selectedStyles[0], // estilo primário para compatibilidade
      styles: selectedStyles,   // todos os estilos selecionados
      pace,
      notes: notes.trim() || undefined,
    };

    // 0) Tenta cache primeiro — economiza chamada OpenAI se já temos um template
    //    com os mesmos parâmetros (próprio ou público)
    let resultDays: SuggestedDay[] = [];
    let usedTemplate: { id: string } | null = null;

    const cached = await findMatchingTemplate(input).catch(() => null);
    if (cached) {
      resultDays = cached.data?.days ?? [];
      usedTemplate = { id: cached.id };
      // Incrementa contador de reaproveitamento
      bumpTemplateReuse(cached.id).catch(() => {});
    } else {
      // 1) Sem cache — chama IA
      const result = await generateItinerarySuggestion(input);

      if (!result.usedAI || result.days.length === 0) {
        setStage('form');
        toast.error(result.error ?? 'IA não conseguiu gerar roteiro.');
        return;
      }
      resultDays = result.days;

      // Salva template em background pra futuras reutilizações
      // (privado por padrão; user pode tornar público depois)
      saveTemplate(input, resultDays).catch(() => {});
    }

    // 2) Resolve lugares via OSM (com progress)
    const total = resultDays.reduce((sum, d) => sum + d.items.length, 0);
    setResolveProgress({ current: 0, total });

    const resolved = await resolveSuggestedDays(
      resultDays,
      destination.trim(),
      (current, t) => setResolveProgress({ current, total: t }),
    );

    // 3) Analisa segurança dos lugares em paralelo (não bloqueia o preview)
    if (user?.id) {
      const placesToAnalyze = resolved
        .flatMap((d) => d.items)
        .filter((item) => item.resolved && item.searchResult)
        .map((item) => ({
          name: item.name,
          id: item.searchResult?.externalId ?? item.name,
        }))
        .slice(0, 10);

      if (placesToAnalyze.length > 0) {
        analyzeMultiplePlaces(
          placesToAnalyze,
          destination.trim(),
          user.id,
        ).catch(() => {});
      }
    }

    setSuggestion(resolved);
    setUsedCachedTemplate(!!usedTemplate);
    setStage('preview');
  }

  function removeItem(dayIdx: number, itemIdx: number) {
    if (!suggestion) return;
    const next: ResolvedDay[] = [...suggestion];
    const day = next[dayIdx];
    next[dayIdx] = {
      ...day,
      items: day.items.filter((_, i) => i !== itemIdx),
    };
    setSuggestion(next);
  }

  async function handleApply() {
    if (!suggestion || !user?.id) return;

    setStage('applying');

    try {
      // Data inicial: usa start_date da viagem se tiver, senão hoje
      const startDate = trip.start_date ?? toDbDate(new Date());

      let totalCreated = 0;

      for (let dayIdx = 0; dayIdx < suggestion.length; dayIdx++) {
        const day = suggestion[dayIdx];
        if (day.items.length === 0) continue;

        // Calcula data: startDate + dayIdx dias
        const d = new Date(startDate + 'T00:00:00');
        d.setDate(d.getDate() + dayIdx);
        const dayDate = toDbDate(d);

        // Garante trip_day
        const dayId = await ensureTripDay(trip.id, dayDate, day.summary);
        if (!dayId) continue;

        // Pra cada item, cria place (se resolveu) + itinerary_item
        for (let itemIdx = 0; itemIdx < day.items.length; itemIdx++) {
          const item = day.items[itemIdx];
          let placeId: string | null = null;

          if (item.resolved && item.searchResult) {
            // Cria entrada em places
            const { data: place } = await supabase
              .from('places')
              .insert({
                trip_id: trip.id,
                name: item.searchResult.name,
                address: item.searchResult.fullAddress,
                latitude: item.searchResult.latitude,
                longitude: item.searchResult.longitude,
                category: item.category,
                notes: item.description,
                created_by: user.id,
              })
              .select('id')
              .single();
            placeId = place?.id ?? null;
          }

          // Cria itinerary_item — com place_id se resolveu, senão custom_title
          await supabase.from('itinerary_items').insert({
            trip_day_id: dayId,
            place_id: placeId,
            custom_title: placeId ? null : item.name,
            start_time: item.startTime,
            duration_minutes: item.durationMinutes,
            notes: placeId ? null : item.description,
            position: itemIdx,
            created_by: user.id,
          });
          totalCreated++;
        }
      }

      toast.success(
        `${totalCreated} ${totalCreated === 1 ? 'lugar adicionado' : 'lugares adicionados'} ao roteiro.`,
      );
      onApplied();
      onClose();

      // Compartilha na galeria se o usuário marcou a opção
      if (user?.id && suggestion && wantShareGallery && !usedCachedTemplate) {
        shareTemplateToGallery(
          destination,
          suggestion,
          user.id,
          { pace, styles: selectedStyles },
        ).catch(() => {});
      }
    } catch (err: any) {
      console.warn('Erro ao aplicar roteiro:', err);
      Alert.alert('Erro', 'Não foi possível aplicar o roteiro. Tente de novo.');
      setStage('preview');
    }
  }

  return (
    <Modal
      visible={visible || (minimized && stage === 'generating')}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      style={minimized ? { opacity: 0 } : undefined}
    >
      <SafeAreaView style={[styles.safe, minimized && { opacity: 0, pointerEvents: 'none' }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Sugerir roteiro com IA</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          style={styles.flex}
        >
          {stage === 'form' && (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.intro}>
                <View style={styles.iconWrap}>
                  <Sparkles size={28} color={colors.primary} />
                </View>
                <Text style={styles.introTitle}>
                  Roteiro gerado por IA
                </Text>
                <Text style={styles.introHint}>
                  Conte sobre sua viagem e a IA vai sugerir lugares e
                  organizar os dias. Você pode revisar antes de aplicar.
                </Text>
              </View>

              <Input
                label="Destino"
                value={destination}
                onChangeText={setDestination}
                placeholder="Ex: Lisboa, Portugal"
              />

              <Input
                label="Quantos dias?"
                value={days}
                onChangeText={(v) => setDays(v.replace(/[^0-9]/g, ''))}
                placeholder="5"
                keyboardType="number-pad"
              />

              <Text style={styles.sectionLabel}>Estilo <Text style={styles.sectionHint}>(selecione um ou mais)</Text></Text>
              <View style={styles.grid}>
                {STYLE_OPTIONS.map((opt) => {
                  const active = selectedStyles.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => toggleStyle(opt.value)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                        {opt.label}
                      </Text>
                      {active && <Text style={styles.chipCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                Ritmo{' '}
                <Text style={styles.sectionHint}>(lugares por dia)</Text>
              </Text>
              <View style={styles.paceRow}>
                {PACE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPace(opt.value)}
                    style={[styles.paceBtn, pace === opt.value && styles.paceBtnActive]}
                  >
                    <Text style={[styles.paceLabel, pace === opt.value && styles.paceLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.paceHint}>{opt.hint}</Text>
                  </Pressable>
                ))}
              </View>

              <View
                onLayout={(e) => {
                  notesYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.sectionLabel}>Observações (opcional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Ex: viajando com criança de 5 anos, evitar comida muito apimentada, gosto de arte moderna..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  style={styles.notesArea}
                  textAlignVertical="top"
                  onFocus={() => {
                    // Atraso pra esperar teclado abrir
                    setTimeout(() => {
                      scrollRef.current?.scrollTo({
                        y: notesYRef.current,
                        animated: true,
                      });
                    }, 250);
                  }}
                />
              </View>

              <Button
                title="Gerar roteiro"
                variant="primary"
                onPress={() => requestConsent(handleGenerate)}
                leftIcon={<Sparkles size={14} color={colors.bg} />}
              />

              <Text style={styles.aiHint}>
                ✨ A IA pode demorar ~10s. Depois mais ~20s pra buscar
                coordenadas dos lugares.
              </Text>
            </ScrollView>
          )}

          {stage === 'generating' && !minimized && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingTitle}>
                {resolveProgress
                  ? 'Buscando lugares no mapa…'
                  : 'IA pensando no seu roteiro…'}
              </Text>
              {resolveProgress && (
                <>
                  <Text style={styles.loadingHint}>
                    {resolveProgress.current} de {resolveProgress.total} lugares encontrados
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(resolveProgress.current / Math.max(1, resolveProgress.total)) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                </>
              )}
              {!resolveProgress && (
                <Text style={styles.loadingHint}>
                  Isso pode levar até 1 minuto para viagens longas…
                </Text>
              )}
              <Pressable
                style={styles.minimizeBtn}
                onPress={() => {
                  setMinimized(true);
                  onClose();
                }}
              >
                <Text style={styles.minimizeBtnText}>
                  ↙ Minimizar e continuar usando o app
                </Text>
              </Pressable>
              <Text style={styles.minimizeHint}>
                Você receberá uma notificação quando o roteiro estiver pronto
              </Text>
            </View>
          )}

          {stage === 'preview' && suggestion && (
            <>
              <ScrollView contentContainerStyle={styles.content}>
                {usedCachedTemplate && (
                  <View style={styles.cacheBadge}>
                    <Text style={styles.cacheBadgeText}>
                      ⚡ Roteiro reaproveitado da galeria — sem custo de IA
                    </Text>
                  </View>
                )}

                <Text style={styles.previewIntro}>
                  Roteiro sugerido pra <Text style={{ fontWeight: '700' }}>{destination}</Text>.
                  Revise e remova o que não quiser.
                </Text>

                {suggestion.map((day, dayIdx) => (
                  <View key={dayIdx} style={styles.dayBlock}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayNumber}>Dia {day.dayNumber}</Text>
                      <Text style={styles.dayTitle}>{day.title}</Text>
                    </View>
                    {day.summary && (
                      <Text style={styles.daySummary}>{day.summary}</Text>
                    )}

                    {day.items.map((item, itemIdx) => (
                      <View key={itemIdx} style={styles.itemRow}>
                        <View style={styles.itemTime}>
                          <Text style={styles.itemTimeText}>
                            {item.startTime ?? '—'}
                          </Text>
                        </View>
                        <View style={styles.itemBody}>
                          <View style={styles.itemTitleRow}>
                            <Text style={styles.itemName} numberOfLines={2}>
                              {item.name}
                            </Text>
                            <Pressable
                              onPress={() => removeItem(dayIdx, itemIdx)}
                              hitSlop={8}
                            >
                              <X size={14} color={colors.textMuted} />
                            </Pressable>
                          </View>
                          {item.description && (
                            <Text style={styles.itemDesc} numberOfLines={2}>
                              {item.description}
                            </Text>
                          )}
                          {!item.resolved && (
                            <Text style={styles.itemUnresolved}>
                              ⚠ Sem coordenadas — vai entrar como nota
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  title="Refazer"
                  variant="ghost"
                  onPress={() => setStage('form')}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Aplicar roteiro"
                  variant="primary"
                  onPress={handleApply}
                  style={{ flex: 2 }}
                />
              </View>
              {/* Opção de compartilhar na galeria */}
              <Pressable
                style={styles.shareGalleryRow}
                onPress={() => setWantShareGallery((v) => !v)}
              >
                <View style={[styles.shareGalleryCheck, wantShareGallery && styles.shareGalleryCheckActive]}>
                  {wantShareGallery && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={styles.shareGalleryText}>
                  Compartilhar roteiro na galeria para outros viajantes
                </Text>
              </Pressable>
            </>
          )}

          {stage === 'applying' && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingTitle}>Aplicando roteiro…</Text>
              <Text style={styles.loadingHint}>
                Criando dias e adicionando lugares na sua viagem
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {consentModal}
    </Modal>
  );
}

/**
 * Calcula número de dias da viagem (start_date até end_date).
 * Default 5 se não tem datas definidas.
 */
function computeDefaultDays(trip: Trip): number {
  if (!trip.start_date || !trip.end_date) return 5;
  const start = new Date(trip.start_date + 'T12:00:00');
  const end = new Date(trip.end_date + 'T12:00:00');
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days); // sem limite máximo — respeita os dias da viagem
}

/**
 * Garante que trip_day existe pra esta data (cria se não existe).
 */
async function ensureTripDay(
  tripId: string,
  date: string,
  notes: string | null,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('trip_days')
    .select('id')
    .eq('trip_id', tripId)
    .eq('day_date', date)
    .maybeSingle();

  if (existing) return existing.id;

  const { count } = await supabase
    .from('trip_days')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .lte('day_date', date);

  const { data: created, error } = await supabase
    .from('trip_days')
    .insert({
      trip_id: tripId,
      day_date: date,
      position: count ?? 0,
      notes,
    })
    .select('id')
    .single();

  if (created) return created.id;

  // Race condition: outro criou — busca de novo
  if (error && (error as any).code === '23505') {
    const { data: retry } = await supabase
      .from('trip_days')
      .select('id')
      .eq('trip_id', tripId)
      .eq('day_date', date)
      .maybeSingle();
    if (retry) return retry.id;
  }

  return null;
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 200, // bem maior pra o teclado não cobrir o último input
  },
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  introTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  introHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
  },
  chipCheck: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipEmoji: {
    fontSize: 16,
  },
  chipLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chipLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  paceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  paceBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  paceBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  paceLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  paceLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  paceHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  notesArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    minHeight: 90,
  },
  aiHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  loadingHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  minimizeBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  minimizeBtnText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  minimizeHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  shareGalleryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  shareGalleryCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  shareGalleryCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  shareGalleryText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  progressBar: {
    width: 220,
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  previewIntro: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  cacheBadge: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.success + '30',
    marginBottom: spacing.sm,
  },
  cacheBadgeText: {
    color: colors.success,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  dayBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadow.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  dayNumber: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  dayTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  daySummary: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  itemTime: {
    width: 50,
  },
  itemTimeText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  itemBody: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  itemDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  itemUnresolved: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
}), [themeVersion]);
}
