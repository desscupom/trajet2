import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { Camera, Clipboard as Clipboard2, FileText, Image as ImageIcon, Plane, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBR } from '@/lib/dates';
import { type AttachedFile, pickDocument, pickImage } from '@/lib/fileAttachment';
import {
  buildFlightNotes,
  buildFlightTitle,
  parseFlights,
  type ParsedFlight,
} from '@/lib/flightParser';
import { parseFlightsWithAI } from '@/lib/flightParserAI';
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
  /** Callback quando voos são importados com sucesso (refresh da tela) */
  onImported: () => void;
};

/**
 * Modal pra importar voo a partir de texto colado.
 *
 * Fluxo:
 * 1. User cola email/itinerário
 * 2. Botão "Detectar voos" — parsing local com regex
 * 3. Preview: mostra todos os voos detectados, user pode editar/remover individualmente
 * 4. Botão "Salvar voos" — cria itinerary_items (cria dia se não existir)
 *
 * Limitações:
 * - Parsing apenas client-side com regex
 * - Voos são salvos como `custom_title` (sem criar entry em `places`)
 *   porque aeroportos não são "destinos" de turismo
 */
export function ImportFlightModal({ trip, visible, onClose, onImported }: Props) {
  const styles = useStyles();
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedFlight[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setText('');
      setParsed(null);
      setAttachedFile(null);
    }
  }, [visible]);

  const [parsing, setParsing] = useState(false);

  /**
   * Tenta detectar voos no texto/arquivo usando IA primeiro, com fallback pro regex.
   * Mostra spinner enquanto a IA processa (~2s pra texto, ~10s pra imagem).
   */
  async function detectFlights(
    rawText: string,
    file?: AttachedFile | null,
  ): Promise<ParsedFlight[]> {
    setParsing(true);
    try {
      // Tenta IA primeiro
      const aiResult = await parseFlightsWithAI(rawText, file);

      if (aiResult.usedAI && aiResult.flights.length > 0) {
        return aiResult.flights;
      }

      // Se IA falhou OU achou nada, tenta regex como fallback (só com texto)
      if (rawText.trim()) {
        const regexFlights = parseFlights(rawText);
        if (regexFlights.length > 0) return regexFlights;
      }

      // Log do erro de IA pra debug
      if (aiResult.error) {
        console.warn('[ImportFlight] IA falhou:', aiResult.error);
        // Se foi erro de PDF, propaga pro usuário
        if (aiResult.error.includes('PDF')) {
          toast.error(aiResult.error);
        }
      }
      return [];
    } finally {
      setParsing(false);
    }
  }

  async function handleParse() {
    if (!text.trim() && !attachedFile) {
      toast.error('Cole o texto ou anexe uma imagem.');
      return;
    }
    const flights = await detectFlights(text, attachedFile);
    setParsed(flights);
    if (flights.length === 0) {
      toast.info('Nenhum voo detectado.');
    }
  }

  /**
   * Lê o clipboard, cola no textarea e tenta detectar automaticamente.
   */
  async function handlePasteAndDetect() {
    const clipboard = await Clipboard.getStringAsync();
    if (!clipboard.trim()) {
      toast.error('Área de transferência vazia.');
      return;
    }
    setText(clipboard);
    const flights = await detectFlights(clipboard, null);
    setParsed(flights);
    if (flights.length === 0) {
      toast.info('Texto colado, mas nenhum voo detectado.');
    } else {
      toast.success(
        `${flights.length} ${flights.length === 1 ? 'voo detectado' : 'voos detectados'}.`,
      );
    }
  }

  /**
   * Abre o picker de imagens e tenta detectar voos a partir da foto/print.
   * Útil pra screenshots de email, foto de boarding pass, etc.
   */
  async function handlePickImage() {
    try {
      const file = await pickImage();
      if (!file) return; // cancelou
      setAttachedFile(file);
      // Detecta automaticamente
      const flights = await detectFlights(text, file);
      setParsed(flights);
      if (flights.length === 0) {
        toast.info('Nenhum voo detectado na imagem.');
      } else {
        toast.success(
          `${flights.length} ${flights.length === 1 ? 'voo detectado' : 'voos detectados'}.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao abrir imagem.');
    }
  }

  /**
   * Abre picker pra escolher PDF (geralmente email salvo como PDF
   * ou bilhete eletrônico). Manda direto pra Vision API que parseia.
   */
  async function handlePickPDF() {
    try {
      const file = await pickDocument();
      if (!file) return; // cancelou
      setAttachedFile(file);
      const flights = await detectFlights(text, file);
      setParsed(flights);
      if (flights.length === 0) {
        toast.info('Nenhum voo detectado no PDF.');
      } else {
        toast.success(
          `${flights.length} ${flights.length === 1 ? 'voo detectado' : 'voos detectados'}.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao abrir arquivo.');
    }
  }

  function removeFlight(index: number) {
    if (!parsed) return;
    setParsed(parsed.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!parsed || parsed.length === 0) return;
    if (!user?.id) return;

    // Filtra voos que têm pelo menos data — sem data não dá pra encaixar no roteiro
    const usable = parsed.filter((f) => f.departureDate);

    if (usable.length === 0) {
      Alert.alert(
        'Sem datas',
        'Nenhum voo tem data identificável. Não dá pra encaixar no roteiro automaticamente.',
      );
      return;
    }

    setSaving(true);

    // Pra cada voo, garante que o trip_day existe e cria o item
    let inserted = 0;
    let errors = 0;

    for (const flight of usable) {
      const dayId = await ensureTripDay(trip.id, flight.departureDate!);
      if (!dayId) {
        errors++;
        continue;
      }

      // Busca quantos itens já existem nesse dia pra setar position
      const { data: existing } = await supabase
        .from('itinerary_items')
        .select('id')
        .eq('trip_day_id', dayId);
      const position = (existing?.length ?? 0);

      const { error } = await supabase.from('itinerary_items').insert({
        trip_day_id: dayId,
        place_id: null,
        custom_title: buildFlightTitle(flight),
        start_time: flight.departureTime,
        notes: buildFlightNotes(flight),
        position,
        created_by: user.id,
      });

      if (error) {
        console.warn('Erro ao inserir voo:', error);
        errors++;
      } else {
        inserted++;
      }
    }

    setSaving(false);

    if (inserted > 0) {
      toast.success(
        `${inserted} ${inserted === 1 ? 'voo importado' : 'voos importados'}.`,
      );
      onImported();
      onClose();
    } else {
      toast.error('Nenhum voo pôde ser importado.');
    }

    if (errors > 0 && inserted > 0) {
      // Avisa que alguns falharam mas outros foram OK
      Alert.alert(
        'Parcialmente importado',
        `${inserted} importado(s), ${errors} com erro. Verifique no roteiro.`,
      );
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
          <Text style={styles.title}>Importar voo</Text>
          <Button title="Cancelar" variant="ghost" onPress={onClose} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {!parsed ? (
              <>
                <View style={styles.intro}>
                  <View style={styles.iconWrap}>
                    <Plane size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.introTitle}>
                    Cole o email ou itinerário
                  </Text>
                  <Text style={styles.introHint}>
                    Suporta emails de reserva da LATAM, Gol, Azul e outras
                    companhias. Detectamos código do voo, aeroportos, data e
                    horário.
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>Texto da reserva</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Ex: Voo LA3024 sai de GRU às 22:30 dia 15/06/2026..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={8}
                  style={styles.textarea}
                  textAlignVertical="top"
                />

                {/* Botões secundários: alternativas a digitar */}
                <View style={styles.secondaryRow}>
                  <Button
                    title="Colar"
                    variant="ghost"
                    size="sm"
                    leftIcon={<Clipboard2 size={14} color={colors.text} />}
                    onPress={handlePasteAndDetect}
                    disabled={parsing}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Foto"
                    variant="ghost"
                    size="sm"
                    leftIcon={<Camera size={14} color={colors.text} />}
                    onPress={handlePickImage}
                    disabled={parsing}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="PDF"
                    variant="ghost"
                    size="sm"
                    leftIcon={<FileText size={14} color={colors.text} />}
                    onPress={handlePickPDF}
                    disabled={parsing}
                    style={{ flex: 1 }}
                  />
                </View>

                {attachedFile && (
                  <View style={styles.fileChip}>
                    <ImageIcon size={14} color={colors.primary} />
                    <Text style={styles.fileChipText} numberOfLines={1}>
                      {attachedFile.name}
                    </Text>
                    <Pressable onPress={() => setAttachedFile(null)} hitSlop={8}>
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )}

                <Button
                  title={parsing ? 'Analisando…' : 'Detectar voos'}
                  variant="primary"
                  onPress={handleParse}
                  loading={parsing}
                  disabled={parsing || (!text.trim() && !attachedFile)}
                />

                <Text style={styles.aiHint}>
                  ✨ Análise feita por IA — funciona com qualquer formato
                </Text>
              </>
            ) : parsed.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nenhum voo detectado</Text>
                <Text style={styles.emptyHint}>
                  Tente colar o texto com mais informações: código do voo
                  (ex: LA3024), aeroportos (GRU, MAD), data e horário.
                </Text>
                <Button
                  title="Tentar de novo"
                  variant="ghost"
                  onPress={() => setParsed(null)}
                />
              </View>
            ) : (
              <>
                <Text style={styles.resultsTitle}>
                  {parsed.length} {parsed.length === 1 ? 'voo detectado' : 'voos detectados'}
                </Text>
                <Text style={styles.resultsHint}>
                  Confira os dados antes de salvar. Os voos serão adicionados
                  ao roteiro nos respectivos dias.
                </Text>

                <View style={styles.flightList}>
                  {parsed.map((f, i) => (
                    <FlightPreviewCard
                      key={i}
                      flight={f}
                      onRemove={() => removeFlight(i)}
                    />
                  ))}
                </View>

                <View style={styles.actionRow}>
                  <Button
                    title="Recolar texto"
                    variant="ghost"
                    onPress={() => setParsed(null)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Salvar voo"
                    variant="primary"
                    onPress={handleSave}
                    loading={saving}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Card de preview de cada voo detectado.
 */
function FlightPreviewCard({
  flight,
  onRemove,
}: {
  flight: ParsedFlight;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const title = buildFlightTitle(flight);
  const dateLabel = flight.departureDate
    ? formatDateBR(flight.departureDate)
    : 'Sem data';
  const hasMissing = !flight.departureDate;

  return (
    <View style={[styles.card, hasMissing && styles.cardWarning]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Plane size={14} color={colors.primary} />
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8} style={styles.cardRemove}>
          <X size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaText}>📅 {dateLabel}</Text>
        {flight.departureTime && (
          <Text style={styles.cardMetaText}>
            🕐 {flight.departureTime}
            {flight.arrivalTime ? ` → ${flight.arrivalTime}` : ''}
          </Text>
        )}
        {flight.reservationCode && (
          <Text style={styles.cardMetaText}>
            🎫 {flight.reservationCode}
          </Text>
        )}
      </View>

      {hasMissing && (
        <Text style={styles.cardWarningText}>
          ⚠ Sem data identificada. Não será importado.
        </Text>
      )}
    </View>
  );
}

/**
 * Garante que existe um trip_day pra esta data. Se não existir, cria.
 * Retorna o ID do dia (existente ou novo) ou null em caso de erro.
 *
 * Position é calculada com base nos dias existentes: conta quantos dias
 * têm data <= esta data e usa esse número (mantém ordem cronológica
 * mesmo que outras telas usem `position` em vez de `day_date`).
 */
async function ensureTripDay(tripId: string, date: string): Promise<string | null> {
  // Busca dia existente
  const { data: existing } = await supabase
    .from('trip_days')
    .select('id')
    .eq('trip_id', tripId)
    .eq('day_date', date)
    .maybeSingle();

  if (existing) return existing.id;

  // Conta dias com data anterior — define position
  const { count } = await supabase
    .from('trip_days')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .lte('day_date', date);

  const position = count ?? 0;

  // Cria novo
  const { data: created, error } = await supabase
    .from('trip_days')
    .insert({
      trip_id: tripId,
      day_date: date,
      position,
    })
    .select('id')
    .single();

  if (created) return created.id;

  // Conflict: outro user pode ter criado entre o SELECT e o INSERT
  // (UNIQUE constraint em trip_id + day_date). Tenta buscar de novo.
  if (error && (error as any).code === '23505') {
    const { data: retry } = await supabase
      .from('trip_days')
      .select('id')
      .eq('trip_id', tripId)
      .eq('day_date', date)
      .maybeSingle();
    if (retry) return retry.id;
  }

  console.warn('Falha ao criar trip_day:', error);
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
    paddingBottom: spacing.xxl,
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
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  textarea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    minHeight: 200,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  resultsTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  resultsHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  flightList: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardWarning: {
    borderColor: colors.warning,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  cardRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    gap: 2,
  },
  cardMetaText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  cardWarningText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  fileChipText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  aiHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
}), [themeVersion]);
}
