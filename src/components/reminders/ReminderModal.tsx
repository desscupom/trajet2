import DateTimePicker from '@react-native-community/datetimepicker';
import {useEffect, useState, useMemo } from 'react';
import {
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
import { Bell, Calendar as CalendarIcon, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { formatDateBR } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import {
  createReminder,
  updateReminder,
  scheduleLocalReminder,
  type UserReminder,
} from '@/lib/userReminders';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Se passar editing, modal entra em modo edição */
  editing?: UserReminder | null;
  /** Trip pré-selecionada (se vier do contexto de uma viagem) */
  prefilledTripId?: string | null;
  onSaved: () => void;
};

/** Quick options pra remind_at (em minutos a partir de agora) */
const QUICK_OPTIONS: Array<{ label: string; offsetMinutes: number }> = [
  { label: 'Em 1 hora', offsetMinutes: 60 },
  { label: 'Em 3 horas', offsetMinutes: 180 },
  { label: 'Amanhã 9h', offsetMinutes: -1 }, // calculado custom
  { label: 'Em 1 semana', offsetMinutes: 7 * 24 * 60 },
];

function computeQuickDate(label: string): Date {
  const now = new Date();
  if (label === 'Em 1 hora') {
    return new Date(now.getTime() + 60 * 60_000);
  }
  if (label === 'Em 3 horas') {
    return new Date(now.getTime() + 3 * 60 * 60_000);
  }
  if (label === 'Amanhã 9h') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  if (label === 'Em 1 semana') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  }
  return now;
}

/**
 * Modal pra criar (ou editar) um reminder customizado.
 *
 * Campos:
 *   - title (obrigatório)
 *   - body (opcional)
 *   - remind_at (obrigatório) — via DateTimePicker
 *
 * Quick options no topo pra setar horário comum (1h, 3h, amanhã 9h, 1 semana).
 */
export function ReminderModal({
  visible,
  onClose,
  editing,
  prefilledTripId,
  onSaved,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const isEditing = !!editing;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [remindAt, setRemindAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itineraryItems, setItineraryItems] = useState<{ id: string; label: string }[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Reset quando abre
  useEffect(() => {
    if (visible) {
      if (editing) {
        setTitle(editing.title);
        setBody(editing.body ?? '');
        setRemindAt(new Date(editing.remind_at));
      } else {
        setTitle('');
        setBody('');
        const d = new Date();
        d.setHours(d.getHours() + 1, 0, 0, 0);
        setRemindAt(d);
      }
      setShowDatePicker(false);
      setShowTimePicker(false);
      setSelectedLocation(null);
      setShowLocationPicker(false);
    }
  }, [visible, editing]);

  // Carrega itens do itinerário se tiver tripId
  useEffect(() => {
    if (!visible || !prefilledTripId) { setItineraryItems([]); return; }
    async function load() {
      const { data: days } = await supabase
        .from('trip_days')
        .select('id, day_date')
        .eq('trip_id', prefilledTripId!)
        .order('day_date');
      if (!days?.length) return;
      const dayMap: Record<string, string> = {};
      days.forEach((d: any) => { dayMap[d.id] = d.day_date; });
      const { data: items } = await supabase
        .from('itinerary_items')
        .select('id, custom_title, start_time, trip_day_id, place:places(name)')
        .in('trip_day_id', days.map((d: any) => d.id))
        .order('trip_day_id').order('position').limit(60);
      if (!items?.length) return;
      const mapped = (items as any[]).map((it) => {
        const name = it.custom_title ?? it.place?.name ?? 'Sem nome';
        const date = dayMap[it.trip_day_id]
          ? new Date(dayMap[it.trip_day_id] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : '';
        const time = it.start_time ? ` ${it.start_time.slice(0, 5)}` : '';
        return { id: it.id, label: `${date}${time} · ${name}` };
      });
      setItineraryItems(mapped);
    }
    load().catch(() => {});
  }, [visible, prefilledTripId]);

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Informe um título.');
      return;
    }
    if (remindAt.getTime() <= Date.now() + 30_000) {
      toast.error('Defina um horário no futuro (pelo menos 30s).');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && editing) {
        await updateReminder(editing.id, {
          title: title.trim(),
          body: body.trim() || undefined,
          remindAt,
        });
        toast.success('Lembrete atualizado.');
      } else {
        const reminder = await createReminder({
          title: title.trim(),
          body: body.trim() || undefined,
          remindAt,
          tripId: prefilledTripId ?? null,
        });
        // Agenda notificação local — não depende de cron
        await scheduleLocalReminder(reminder).catch(() => {});
        toast.success('Lembrete criado. Você será notificado no horário.');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro.');
    } finally {
      setSaving(false);
    }
  }

  function onDateChange(_event: any, selected?: Date) {
    setShowDatePicker(Platform.OS === 'ios'); // iOS mantém aberto
    if (selected) {
      // Preserva hora ao trocar de data
      const merged = new Date(remindAt);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setRemindAt(merged);
    }
  }

  function onTimeChange(_event: any, selected?: Date) {
    setShowTimePicker(Platform.OS === 'ios');
    if (selected) {
      const merged = new Date(remindAt);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setRemindAt(merged);
    }
  }

  const timeStr = remindAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditing ? 'Editar lembrete' : 'Novo lembrete'}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={styles.intro}>
              <View style={styles.iconWrap}>
                <Bell size={24} color={colors.primary} />
              </View>
              <Text style={styles.introHint}>
                Você vai receber uma notificação no horário escolhido.
              </Text>
            </View>

            <Text style={styles.label}>Título</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Comprar repelente"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={100}
            />

            <Text style={styles.label}>Detalhes (opcional)</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Detalhes ou observações..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.inputMulti]}
              textAlignVertical="top"
              maxLength={500}
            />

            {/* Campo de local — itens do itinerário */}
            {prefilledTripId && (
              <View>
                <Text style={styles.label}>Local (opcional)</Text>
                {itineraryItems.length === 0 ? (
                  <View style={styles.locationEmpty}>
                    <Text style={styles.locationEmptyText}>
                      Adicione endereços ao seu itinerário antes de associar um local ao lembrete.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Pressable
                      style={styles.locationBtn}
                      onPress={() => setShowLocationPicker(!showLocationPicker)}
                    >
                      <Text style={selectedLocation ? styles.locationSelected : styles.locationPlaceholder}>
                        {selectedLocation
                          ? itineraryItems.find(i => i.id === selectedLocation)?.label ?? 'Local selecionado'
                          : 'Nenhum local associado'}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {showLocationPicker ? '▲' : '▼'}
                      </Text>
                    </Pressable>
                    {showLocationPicker && (
                      <View style={styles.locationList}>
                        <Pressable
                          style={styles.locationItem}
                          onPress={() => { setSelectedLocation(null); setShowLocationPicker(false); }}
                        >
                          <Text style={styles.locationItemText}>Nenhum</Text>
                        </Pressable>
                        {itineraryItems.map((item) => (
                          <Pressable
                            key={item.id}
                            style={[styles.locationItem, selectedLocation === item.id && styles.locationItemActive]}
                            onPress={() => { setSelectedLocation(item.id); setShowLocationPicker(false); }}
                          >
                            <Text style={[styles.locationItemText, selectedLocation === item.id && { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Quick options (só quando criando, não editando) */}
            {!isEditing && (
              <>
                <Text style={styles.label}>Atalhos</Text>
                <View style={styles.quickRow}>
                  {QUICK_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.label}
                      onPress={() => setRemindAt(computeQuickDate(opt.label))}
                      style={styles.quickBtn}
                    >
                      <Text style={styles.quickLabel}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Quando lembrar?</Text>
            <View style={styles.dateTimeRow}>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[styles.dateBtn, { flex: 2 }]}
              >
                <CalendarIcon size={14} color={colors.primary} />
                <Text style={styles.dateBtnText}>
                  {formatDateBR(remindAt.toISOString().split('T')[0])}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                style={[styles.dateBtn, { flex: 1 }]}
              >
                <Text style={styles.dateBtnText}>{timeStr}</Text>
              </Pressable>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={remindAt}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={remindAt}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
                is24Hour
              />
            )}

            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Disparará em</Text>
              <Text style={styles.previewValue}>
                {remindAt.toLocaleString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title={isEditing ? 'Salvar' : 'Criar lembrete'}
              variant="primary"
              onPress={handleSave}
              loading={saving}
              leftIcon={<Bell size={14} color={colors.primaryTextOnSolid} />}
              fullWidth
            />
          </View>
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
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
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
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  introHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputMulti: {
    minHeight: 80,
  },
  locationEmpty: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationEmptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  locationBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  locationSelected: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500', flex: 1 },
  locationPlaceholder: { color: colors.textMuted, fontSize: fontSize.sm, flex: 1 },
  locationList: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    overflow: 'hidden',
    maxHeight: 200,
  },
  locationItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  locationItemActive: { backgroundColor: colors.primarySofter },
  locationItemText: { fontSize: fontSize.sm, color: colors.textMuted },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  dateBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  preview: {
    backgroundColor: colors.primarySofter,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    marginTop: spacing.sm,
  },
  previewLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  previewValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
}), [themeVersion]);
}
