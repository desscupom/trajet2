import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Sparkles, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  type SuggestedItem,
  type SuggestionStyle,
} from '@/lib/itinerarySuggester';
import {
  resolveSuggestedPlaces,
  type ResolvedSuggestedItem,
} from '@/lib/itinerarySuggesterResolve';
import { suggestMorePlaces } from '@/lib/suggestMorePlaces';
import { supabase, type Trip } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

import type { ItineraryItem } from './types';

type Props = {
  trip: Trip;
  visible: boolean;
  onClose: () => void;
  /** Dia ao qual adicionar */
  tripDayId: string;
  /** Lugares já existentes neste dia (pra IA não duplicar) */
  existingItems: ItineraryItem[];
  /** Refresh callback */
  onAdded: () => void;
};

type Stage = 'form' | 'generating' | 'preview' | 'applying';

const STYLE_OPTIONS: {
  value: string;
  label: string;
  emoji: string;
}[] = [
  { value: 'any', label: 'Qualquer', emoji: '✨' },
  { value: 'food', label: 'Comida', emoji: '🍽️' },
  { value: 'tourist', label: 'Turístico', emoji: '🗺️' },
  { value: 'cultural', label: 'Cultural', emoji: '🎨' },
  { value: 'nature', label: 'Natureza', emoji: '🌳' },
  { value: 'shopping', label: 'Compras', emoji: '🛍️' },
];

// Mapeia opções do chip → SuggestionStyle (algumas viram observação ao invés de style)
function chipToInput(
  chip: string,
  baseNotes: string,
): { style?: SuggestionStyle; notes: string } {
  const styles = useStyles();
  switch (chip) {
    case 'food':
      return {
        style: 'gastronomic',
        notes: baseNotes,
      };
    case 'nature':
      return {
        style: 'adventure',
        notes: baseNotes
          ? `${baseNotes}. Foco em natureza/parques.`
          : 'Foco em natureza/parques.',
      };
    case 'shopping':
      return {
        notes: baseNotes
          ? `${baseNotes}. Sugira lugares de compras (lojas, mercados, feiras).`
          : 'Sugira lugares de compras (lojas, mercados, feiras).',
      };
    case 'any':
      return { notes: baseNotes };
    default:
      return {
        style: chip as SuggestionStyle,
        notes: baseNotes,
      };
  }
}

/**
 * Modal pra adicionar mais lugares a um dia existente via IA.
 *
 * Fluxo simplificado vs. SuggestItineraryModal:
 * - Sem escolha de número de dias
 * - Escolhe número de lugares (3 default)
 * - Estilo simplificado (alguns viram apenas observação no prompt)
 * - Resolve via OSM (mesmo rate limit)
 * - Insert no trip_day já existente (não cria novo dia)
 */
export function SuggestMorePlacesModal({
  trip,
  visible,
  onClose,
  tripDayId,
  existingItems,
  onAdded,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();

  const [count, setCount] = useState('3');
  const [chip, setChip] = useState<string>('any');
  const [notes, setNotes] = useState('');

  const [stage, setStage] = useState<Stage>('form');
  const [suggestion, setSuggestion] = useState<ResolvedSuggestedItem[] | null>(null);
  const [resolveProgress, setResolveProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      setCount('3');
      setChip('any');
      setNotes('');
      setStage('form');
      setSuggestion(null);
      setResolveProgress(null);
    }
  }, [visible]);

  const countNumber = useMemo(() => {
    const n = parseInt(count, 10);
    return isNaN(n) ? 0 : n;
  }, [count]);

  async function handleGenerate() {
    if (countNumber < 1 || countNumber > 8) {
      toast.error('Quantidade deve ser entre 1 e 8.');
      return;
    }

    setStage('generating');
    setResolveProgress(null);

    // Mapeia chip pra input da IA
    const { style, notes: composedNotes } = chipToInput(chip, notes.trim());

    // Constrói lista de "já existentes" pra IA não duplicar
    const existing = existingItems.map((it) => ({
      name: it.custom_title ?? it.place?.name ?? 'Sem nome',
      startTime: it.start_time,
      category: it.place?.category ?? null,
    }));

    const result = await suggestMorePlaces({
      destination: trip.title,
      existingPlaces: existing,
      count: countNumber,
      style,
      notes: composedNotes || undefined,
    });

    if (!result.usedAI || result.items.length === 0) {
      setStage('form');
      toast.error(result.error ?? 'IA não conseguiu sugerir lugares.');
      return;
    }

    // Resolve via OSM
    setResolveProgress({ current: 0, total: result.items.length });

    const resolved = await resolveSuggestedPlaces(
      result.items,
      trip.title,
      (current, total) => setResolveProgress({ current, total }),
    );

    setSuggestion(resolved);
    setStage('preview');
  }

  function removeItem(idx: number) {
    if (!suggestion) return;
    setSuggestion(suggestion.filter((_, i) => i !== idx));
  }

  async function handleApply() {
    if (!suggestion || !user?.id || suggestion.length === 0) return;

    setStage('applying');

    try {
      // Conta itens existentes pra setar position incremental
      const { count: existingCount } = await supabase
        .from('itinerary_items')
        .select('id', { count: 'exact', head: true })
        .eq('trip_day_id', tripDayId);

      let basePosition = existingCount ?? 0;
      let totalCreated = 0;

      for (const item of suggestion) {
        let placeId: string | null = null;

        if (item.resolved && item.searchResult) {
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

        await supabase.from('itinerary_items').insert({
          trip_day_id: tripDayId,
          place_id: placeId,
          custom_title: placeId ? null : item.name,
          start_time: item.startTime,
          duration_minutes: item.durationMinutes,
          notes: placeId ? null : item.description,
          position: basePosition++,
          created_by: user.id,
        });
        totalCreated++;
      }

      toast.success(
        `${totalCreated} ${totalCreated === 1 ? 'lugar adicionado' : 'lugares adicionados'}.`,
      );
      onAdded();
      onClose();
    } catch (err: any) {
      console.warn('Erro ao adicionar lugares:', err);
      toast.error('Erro ao salvar. Tente de novo.');
      setStage('preview');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Sugerir mais lugares</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          {stage === 'form' && (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            >
              <View style={styles.intro}>
                <View style={styles.iconWrap}>
                  <Sparkles size={24} color={colors.primary} />
                </View>
                <Text style={styles.introHint}>
                  A IA vai sugerir lugares novos que complementam os{' '}
                  {existingItems.length} já planejados pra este dia.
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Quantos lugares?</Text>
              <View style={styles.countRow}>
                {['1', '2', '3', '4', '5'].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setCount(n)}
                    style={[
                      styles.countBtn,
                      count === n && styles.countBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.countLabel,
                        count === n && styles.countLabelActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Tipo</Text>
              <View style={styles.grid}>
                {STYLE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setChip(opt.value)}
                    style={[
                      styles.chip,
                      chip === opt.value && styles.chipActive,
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        chip === opt.value && styles.chipLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Observações (opcional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: algo perto da Sé, lugar com boa vista, opção vegetariana..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                style={styles.notesArea}
                textAlignVertical="top"
              />

              <Button
                title="Gerar sugestões"
                variant="primary"
                onPress={handleGenerate}
                leftIcon={<Sparkles size={14} color={colors.bg} />}
              />
            </ScrollView>
          )}

          {stage === 'generating' && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingTitle}>
                {resolveProgress
                  ? 'Buscando lugares no mapa…'
                  : 'IA pensando em sugestões…'}
              </Text>
              {resolveProgress && (
                <>
                  <Text style={styles.loadingHint}>
                    {resolveProgress.current} de {resolveProgress.total}
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
            </View>
          )}

          {stage === 'preview' && suggestion && (
            <>
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.previewIntro}>
                  Revise e remova o que não quiser.
                </Text>

                {suggestion.map((item, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTime}>
                        {item.startTime ?? '—'}
                      </Text>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Pressable onPress={() => removeItem(idx)} hitSlop={8}>
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
                ))}

                {suggestion.length === 0 && (
                  <Text style={styles.previewIntro}>
                    Nenhum lugar selecionado. Volte e tente de novo.
                  </Text>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  title="Refazer"
                  variant="ghost"
                  onPress={() => setStage('form')}
                  style={{ flex: 1 }}
                />
                <Button
                  title={`Adicionar ${suggestion.length}`}
                  variant="primary"
                  onPress={handleApply}
                  disabled={suggestion.length === 0}
                  style={{ flex: 2 }}
                />
              </View>
            </>
          )}

          {stage === 'applying' && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingTitle}>Adicionando…</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
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
    paddingBottom: 180,
  },
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  countRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countBtn: {
    flex: 1,
    aspectRatio: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  countLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  countLabelActive: {
    color: colors.primary,
    fontWeight: '700',
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
  notesArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    minHeight: 80,
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
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTime: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    width: 50,
  },
  itemName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  itemDesc: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginLeft: 58,
  },
  itemUnresolved: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: spacing.xs,
    marginLeft: 58,
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
