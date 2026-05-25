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
import { Hotel, Sparkles, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { searchPlaces } from '@/lib/places';
import {
  suggestLodgings,
  type LodgingPriceLevel,
  type SuggestedLodging,
} from '@/lib/lodgingSuggester';
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

type SelectableLodging = SuggestedLodging & {
  selected: boolean;
  /** Coordenadas resolvidas via OSM, se conseguir */
  resolvedAddress?: string | null;
  resolvedLat?: number | null;
  resolvedLng?: number | null;
};

const PRICE_OPTIONS: {
  value: LodgingPriceLevel;
  label: string;
  emoji: string;
}[] = [
  { value: 'budget', label: 'Econômico', emoji: '💰' },
  { value: 'moderate', label: 'Médio', emoji: '💵' },
  { value: 'premium', label: 'Premium', emoji: '💎' },
  { value: 'luxury', label: 'Luxo', emoji: '👑' },
];

const KIND_OPTIONS: {
  value: 'hotel' | 'airbnb' | 'hostel' | 'mixed';
  label: string;
  emoji: string;
}[] = [
  { value: 'mixed', label: 'Mistura', emoji: '🎲' },
  { value: 'hotel', label: 'Hotel', emoji: '🏨' },
  { value: 'airbnb', label: 'Airbnb', emoji: '🏠' },
  { value: 'hostel', label: 'Hostel', emoji: '🛏️' },
];

const PRICE_LABELS: Record<LodgingPriceLevel, string> = {
  budget: 'Econômico',
  moderate: 'Médio',
  premium: 'Premium',
  luxury: 'Luxo',
};

/**
 * Modal pra sugerir hospedagens via IA.
 *
 * Fluxo:
 * 1. Form: orçamento, tipo, observações
 * 2. Generating: IA processa
 * 3. Preview: lista com checkbox — user marca quais quer salvar
 *    Em paralelo: resolve cada um no OSM pra ter endereço
 * 4. Apply: insere selecionadas em `lodgings`
 *
 * IMPORTANTE: a IA NÃO retorna preços/disponibilidade reais — só recomendações.
 * UI deixa isso claro pro user.
 */
export function SuggestLodgingsModal({
  trip,
  visible,
  onClose,
  onApplied,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();

  const [priceLevel, setPriceLevel] = useState<LodgingPriceLevel>('moderate');
  const [kind, setKind] = useState<'hotel' | 'airbnb' | 'hostel' | 'mixed'>('mixed');
  const [count, setCount] = useState('4');
  const [notes, setNotes] = useState('');

  const [stage, setStage] = useState<Stage>('form');
  const [results, setResults] = useState<SelectableLodging[] | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (visible) {
      setPriceLevel('moderate');
      setKind('mixed');
      setCount('4');
      setNotes('');
      setStage('form');
      setResults(null);
      setResolving(false);
    }
  }, [visible]);

  const countNumber = useMemo(() => {
    const n = parseInt(count, 10);
    return isNaN(n) ? 0 : n;
  }, [count]);

  async function handleGenerate() {
    if (countNumber < 2 || countNumber > 8) {
      toast.error('Quantidade deve ser entre 2 e 8.');
      return;
    }

    setStage('generating');

    const result = await suggestLodgings({
      destination: trip.title,
      count: countNumber,
      priceLevel,
      kindPreference: kind,
      notes: notes.trim() || undefined,
    });

    if (!result.usedAI || result.lodgings.length === 0) {
      setStage('form');
      toast.error(result.error ?? 'IA não conseguiu sugerir hospedagens.');
      return;
    }

    // Inicializa como selecionáveis
    const selectable: SelectableLodging[] = result.lodgings.map((l) => ({
      ...l,
      selected: true,
    }));
    setResults(selectable);
    setStage('preview');

    // Resolve endereços em background (não bloqueia preview)
    resolveAddresses(selectable);
  }

  /**
   * Resolve endereço/coordenadas via OSM em background.
   * 1.1s entre chamadas (rate limit do Nominatim).
   */
  async function resolveAddresses(lodgings: SelectableLodging[]) {
    setResolving(true);
    const updated = [...lodgings];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      // Query: nome + bairro + destino pra desambiguar
      const queryParts = [item.name];
      if (item.neighborhood) queryParts.push(item.neighborhood);
      queryParts.push(trip.title);
      const query = queryParts.join(', ');

      try {
        const matches = await searchPlaces(query);
        if (matches.length > 0) {
          const best = matches[0];
          updated[i] = {
            ...item,
            resolvedAddress: best.fullAddress,
            resolvedLat: best.latitude,
            resolvedLng: best.longitude,
          };
          setResults([...updated]);
        }
      } catch {
        // segue
      }

      // delay (não no último)
      if (i < updated.length - 1) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    setResolving(false);
  }

  function toggleSelected(idx: number) {
    if (!results) return;
    const next = [...results];
    next[idx] = { ...next[idx], selected: !next[idx].selected };
    setResults(next);
  }

  async function handleApply() {
    if (!results || !user?.id) return;
    const selected = results.filter((r) => r.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos uma opção.');
      return;
    }

    setStage('applying');

    try {
      let inserted = 0;

      for (const item of selected) {
        // Monta notes combinando descrição da IA + faixa de preço estimada
        const notesParts: string[] = [];
        if (item.notes) notesParts.push(item.notes);
        if (item.neighborhood) notesParts.push(`Bairro: ${item.neighborhood}`);
        notesParts.push(
          `Faixa estimada: ${PRICE_LABELS[item.estimatedPriceLevel]} (confirme preços no site)`,
        );

        const { error } = await supabase.from('lodgings').insert({
          trip_id: trip.id,
          name: item.name,
          kind: item.kind,
          address: item.resolvedAddress ?? item.neighborhood ?? null,
          latitude: item.resolvedLat ?? null,
          longitude: item.resolvedLng ?? null,
          notes: notesParts.join('\n'),
          created_by: user.id,
        });

        if (!error) inserted++;
      }

      toast.success(
        `${inserted} ${inserted === 1 ? 'opção salva' : 'opções salvas'}.`,
      );
      onApplied();
      onClose();
    } catch (err: any) {
      console.warn('Erro ao salvar:', err);
      toast.error('Erro ao salvar. Tente de novo.');
      setStage('preview');
    }
  }

  const selectedCount = results?.filter((r) => r.selected).length ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Sugerir hospedagem</Text>
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
                  IA vai sugerir opções de hospedagem em{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {trip.title}
                  </Text>
                  .
                </Text>
              </View>

              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠ As sugestões são recomendações conhecidas — não verificamos
                  disponibilidade nem preços reais. Confirme no Booking, Airbnb
                  ou site do hotel antes de reservar.
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Orçamento</Text>
              <View style={styles.grid}>
                {PRICE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPriceLevel(opt.value)}
                    style={[
                      styles.chip,
                      priceLevel === opt.value && styles.chipActive,
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        priceLevel === opt.value && styles.chipLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Tipo</Text>
              <View style={styles.grid}>
                {KIND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setKind(opt.value)}
                    style={[
                      styles.chip,
                      kind === opt.value && styles.chipActive,
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        kind === opt.value && styles.chipLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Quantas opções?</Text>
              <View style={styles.countRow}>
                {['2', '3', '4', '5', '6'].map((n) => (
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

              <Text style={styles.sectionLabel}>Observações (opcional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: viajando com criança, perto do centro histórico, com piscina..."
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
              <Text style={styles.loadingTitle}>IA pensando em opções…</Text>
            </View>
          )}

          {stage === 'preview' && results && (
            <>
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.previewIntro}>
                  Marque as opções que quer salvar.{' '}
                  {resolving && '🔄 Buscando endereços…'}
                </Text>

                {results.map((item, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => toggleSelected(idx)}
                    style={[
                      styles.itemCard,
                      item.selected && styles.itemCardSelected,
                    ]}
                  >
                    <View style={styles.itemHeader}>
                      <View
                        style={[
                          styles.checkbox,
                          item.selected && styles.checkboxActive,
                        ]}
                      >
                        {item.selected && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <View style={styles.itemMeta}>
                          <Text style={styles.itemMetaText}>
                            {kindEmoji(item.kind)} {kindLabel(item.kind)}
                          </Text>
                          <Text style={styles.itemMetaDot}>·</Text>
                          <Text style={styles.itemMetaText}>
                            {PRICE_LABELS[item.estimatedPriceLevel]}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {item.neighborhood && (
                      <Text style={styles.itemNeighborhood}>
                        📍 {item.neighborhood}
                      </Text>
                    )}

                    {item.notes && (
                      <Text style={styles.itemNotes}>{item.notes}</Text>
                    )}

                    {item.resolvedAddress && (
                      <Text style={styles.itemResolved} numberOfLines={2}>
                        🗺️ {item.resolvedAddress}
                      </Text>
                    )}
                  </Pressable>
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
                  title={`Salvar ${selectedCount}`}
                  variant="primary"
                  onPress={handleApply}
                  disabled={selectedCount === 0}
                  style={{ flex: 2 }}
                />
              </View>
            </>
          )}

          {stage === 'applying' && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingTitle}>Salvando…</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function kindEmoji(k: SuggestedLodging['kind']): string {
  switch (k) {
    case 'hotel':
      return '🏨';
    case 'airbnb':
      return '🏠';
    case 'hostel':
      return '🛏️';
    case 'house':
      return '🏡';
    default:
      return '🏢';
  }
}

function kindLabel(k: SuggestedLodging['kind']): string {
  switch (k) {
    case 'hotel':
      return 'Hotel';
    case 'airbnb':
      return 'Airbnb';
    case 'hostel':
      return 'Hostel';
    case 'house':
      return 'Casa';
    default:
      return 'Outro';
  }
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
    marginBottom: spacing.xs,
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
  warningBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  warningText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
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
    gap: spacing.xs,
    ...shadow.sm,
  },
  itemCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.bg,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  itemName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  itemMetaText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  itemMetaDot: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  itemNeighborhood: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginLeft: 30,
  },
  itemNotes: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginLeft: 30,
    lineHeight: 18,
  },
  itemResolved: {
    color: colors.primary,
    fontSize: fontSize.xs,
    marginLeft: 30,
    marginTop: spacing.xs,
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
