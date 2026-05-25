import * as Clipboard from 'expo-clipboard';
import {useEffect, useState, useMemo } from 'react';
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
import {
  Camera,
  Clipboard as Clipboard2,
  FileText,
  Hotel,
  Image as ImageIcon,
  X,
} from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBR } from '@/lib/dates';
import { type AttachedFile, pickDocument, pickImage } from '@/lib/fileAttachment';
import {
  parseLodgingsWithAI,
  type ParsedLodging,
} from '@/lib/lodgingParserAI';
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
  onImported: () => void;
};

/**
 * Modal pra importar hospedagem a partir de texto/imagem da reserva.
 *
 * Espelha o fluxo do ImportFlightModal:
 * 1. User cola texto OU anexa foto OU "Colar" da área de transferência
 * 2. IA detecta hospedagens
 * 3. Preview com cards editáveis
 * 4. Salvar → cria entries em `lodgings`
 */
export function ImportLodgingModal({
  trip,
  visible,
  onClose,
  onImported,
}: Props) {
  const styles = useStyles();
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedLodging[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setParsed(null);
      setAttachedFile(null);
    }
  }, [visible]);

  async function detect(
    rawText: string,
    file?: AttachedFile | null,
  ): Promise<ParsedLodging[]> {
    setParsing(true);
    try {
      const result = await parseLodgingsWithAI(rawText, file);
      if (result.error) {
        console.warn('[ImportLodging] IA falhou:', result.error);
        if ((result.error ?? '').includes('PDF')) {
          toast.error(result.error);
        }
      }
      return result.lodgings;
    } finally {
      setParsing(false);
    }
  }

  async function handleParse() {
    if (!text.trim() && !attachedFile) {
      toast.error('Cole o texto ou anexe uma imagem.');
      return;
    }
    const lodgings = await detect(text, attachedFile);
    setParsed(lodgings);
    if (lodgings.length === 0) {
      toast.info('Nenhuma hospedagem detectada.');
    }
  }

  async function handlePasteAndDetect() {
    const clipboard = await Clipboard.getStringAsync();
    if (!clipboard.trim()) {
      toast.error('Área de transferência vazia.');
      return;
    }
    setText(clipboard);
    const lodgings = await detect(clipboard, null);
    setParsed(lodgings);
    if (lodgings.length === 0) {
      toast.info('Nenhuma hospedagem detectada no texto.');
    } else {
      toast.success(
        `${lodgings.length} ${lodgings.length === 1 ? 'hospedagem detectada' : 'hospedagens detectadas'}.`,
      );
    }
  }

  async function handlePickImage() {
    try {
      const file = await pickImage();
      if (!file) return;
      setAttachedFile(file);
      const lodgings = await detect(text, file);
      setParsed(lodgings);
      if (lodgings.length === 0) {
        toast.info('Nenhuma hospedagem detectada na imagem.');
      } else {
        toast.success(
          `${lodgings.length} ${lodgings.length === 1 ? 'hospedagem detectada' : 'hospedagens detectadas'}.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao abrir imagem.');
    }
  }

  async function handlePickPDF() {
    try {
      const file = await pickDocument();
      if (!file) return;
      setAttachedFile(file);
      const lodgings = await detect(text, file);
      setParsed(lodgings);
      if (lodgings.length === 0) {
        toast.info('Nenhuma hospedagem detectada no PDF.');
      } else {
        toast.success(
          `${lodgings.length} ${lodgings.length === 1 ? 'hospedagem detectada' : 'hospedagens detectadas'}.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao abrir arquivo.');
    }
  }

  function removeLodging(index: number) {
    if (!parsed) return;
    setParsed(parsed.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!parsed || parsed.length === 0 || !user?.id) return;

    setSaving(true);
    let inserted = 0;
    let errors = 0;

    for (const lodging of parsed) {
      const payload = {
        trip_id: trip.id,
        name: lodging.name,
        kind: lodging.kind,
        address: lodging.address,
        latitude: null,
        longitude: null,
        check_in_at: lodging.checkInAt
          ? new Date(lodging.checkInAt).toISOString()
          : null,
        check_out_at: lodging.checkOutAt
          ? new Date(lodging.checkOutAt).toISOString()
          : null,
        reservation_code: lodging.reservationCode,
        cost_amount: lodging.costAmount,
        cost_currency: lodging.costAmount ? lodging.costCurrency : null,
        notes: lodging.notes,
        created_by: user.id,
      };

      const { error } = await supabase.from('lodgings').insert(payload);
      if (error) {
        console.warn('Erro ao inserir hospedagem:', error);
        errors++;
      } else {
        inserted++;
      }
    }

    setSaving(false);

    if (inserted > 0) {
      toast.success(
        `${inserted} ${inserted === 1 ? 'hospedagem importada' : 'hospedagens importadas'}.`,
      );
      onImported();
      onClose();
    } else {
      toast.error('Nenhuma hospedagem pôde ser importada.');
    }

    if (errors > 0 && inserted > 0) {
      Alert.alert(
        'Parcialmente importado',
        `${inserted} importada(s), ${errors} com erro.`,
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
          <Text style={styles.title}>Importar hospedagem</Text>
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
                    <Hotel size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.introTitle}>
                    Cole o email ou anexe a foto da reserva
                  </Text>
                  <Text style={styles.introHint}>
                    Funciona com confirmações da Booking, Airbnb, hotéis,
                    hostels e vouchers em geral.
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>Texto da reserva</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Ex: Sua reserva no Hotel Ipanema Plaza, Rio de Janeiro, está confirmada. Check-in: 15/06/2026..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={8}
                  style={styles.textarea}
                  textAlignVertical="top"
                />

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
                  title={parsing ? 'Analisando…' : 'Detectar hospedagens'}
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
                <Text style={styles.emptyTitle}>Nenhuma hospedagem detectada</Text>
                <Text style={styles.emptyHint}>
                  Tente colar o texto com mais detalhes ou enviar uma imagem
                  mais clara.
                </Text>
                <Button
                  title="Tentar de novo"
                  variant="ghost"
                  onPress={() => {
                    setParsed(null);
                    setAttachedFile(null);
                  }}
                />
              </View>
            ) : (
              <>
                <Text style={styles.resultsTitle}>
                  {parsed.length}{' '}
                  {parsed.length === 1
                    ? 'hospedagem detectada'
                    : 'hospedagens detectadas'}
                </Text>
                <Text style={styles.resultsHint}>
                  Confira antes de salvar.
                </Text>

                <View style={styles.list}>
                  {parsed.map((l, i) => (
                    <LodgingPreviewCard
                      key={i}
                      lodging={l}
                      onRemove={() => removeLodging(i)}
                    />
                  ))}
                </View>

                <View style={styles.actionRow}>
                  <Button
                    title="Recomeçar"
                    variant="ghost"
                    onPress={() => {
                      setParsed(null);
                      setAttachedFile(null);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={`Salvar hospedagem`}
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

function LodgingPreviewCard({
  lodging,
  onRemove,
}: {
  lodging: ParsedLodging;
  onRemove: () => void;
}) {
  const checkIn = lodging.checkInAt
    ? formatDateBR(lodging.checkInAt.split('T')[0])
    : null;
  const checkOut = lodging.checkOutAt
    ? formatDateBR(lodging.checkOutAt.split('T')[0])
    : null;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <View style={cardStyles.icon}>
          <Hotel size={14} color={colors.primary} />
        </View>
        <Text style={cardStyles.title} numberOfLines={1}>
          {lodging.name}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8} style={cardStyles.remove}>
          <X size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {lodging.address && (
        <Text style={cardStyles.meta}>📍 {lodging.address}</Text>
      )}
      {checkIn && checkOut && (
        <Text style={cardStyles.meta}>
          🗓 {checkIn} → {checkOut}
        </Text>
      )}
      {lodging.reservationCode && (
        <Text style={cardStyles.meta}>🎫 {lodging.reservationCode}</Text>
      )}
      {lodging.costAmount !== null && lodging.costCurrency && (
        <Text style={cardStyles.meta}>
          💰 {lodging.costCurrency} {lodging.costAmount.toFixed(2)}
        </Text>
      )}
    </View>
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
    minHeight: 160,
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
  list: {
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
}), [themeVersion]);
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    ...shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  remove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
