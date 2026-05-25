/**
 * EditTimeModal — define horário e duração de um item do roteiro.
 *
 * Mobile: usa o DateTimePicker nativo (iOS wheel / Android clock)
 *         para selecionar hora E minutos.
 * Web:    usa <input type="time"> nativo.
 * 
 * Também permite definir a duração estimada (15 min → 4h).
 */

import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {useEffect, useState, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { Clock } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { updateItemTime } from '@/lib/itinerary';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

type Props = {
  itemId: string | null;
  initialTime: string | null;
  initialDuration?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

// Chips de horário rápido (hora cheia mais comum)
const QUICK_TIMES = [
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00',
];

// Opções de duração
const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1h', value: 60 },
  { label: '1h30', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];

/** Converte "HH:MM" → Date (hoje) para o picker */
function timeStrToDate(t: string | null): Date {
  const d = new Date();
  if (t) {
    const [h, m] = (t ?? '00:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

/** Converte Date → "HH:MM" */
function dateToTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EditTimeModal({
  itemId,
  initialTime,
  initialDuration,
  onClose,
  onSaved,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = initialTime ? initialTime.slice(0, 5) : null;
    setTime(t);
    setPickerDate(timeStrToDate(t));
    setDuration(initialDuration ?? null);
    // iOS mostra picker sempre; Android mostra só quando clicado
    setShowPicker(Platform.OS === 'ios');
  }, [initialTime, initialDuration, itemId]);

  function handlePickerChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
    }
    if (date) {
      const str = dateToTimeStr(date);
      setTime(str);
      setPickerDate(date);
    }
  }

  function handleQuickTime(t: string) {
    setTime(t);
    setPickerDate(timeStrToDate(t));
  }

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);

    const formatted = time ? `${time}:00` : null;
    const { error } = await updateItemTime(itemId, formatted);

    // Salva duração se mudou
    if (!error && duration !== undefined) {
      await supabase
        .from('itinerary_items')
        .update({ duration_minutes: duration })
        .eq('id', itemId);
    }

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function handleClear() {
    if (!itemId) return;
    setSaving(true);
    const { error } = await updateItemTime(itemId, null);
    if (!error) {
      await supabase
        .from('itinerary_items')
        .update({ duration_minutes: null })
        .eq('id', itemId);
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal
      visible={itemId !== null}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Definir horário</Text>
          <Button title="Cancelar" variant="ghost" size="sm" onPress={onClose} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Preview do horário selecionado */}
            <View style={styles.previewWrap}>
              <View style={styles.previewIcon}>
                <Clock size={28} color={colors.primary} />
              </View>
              <Text style={styles.preview}>{time ?? '— : —'}</Text>
              <Text style={styles.previewHint}>
                {Platform.OS === 'ios'
                  ? 'Use o seletor abaixo para escolher hora e minutos'
                  : 'Toque num horário rápido ou no botão para abrir o relógio'}
              </Text>
            </View>

            {/* Picker nativo iOS — roda inline */}
            {Platform.OS === 'ios' && (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="spinner"
                  onChange={handlePickerChange}
                  minuteInterval={5}
                  locale="pt-BR"
                  textColor={colors.text}
                  themeVariant="dark"
                  style={styles.iosPicker}
                />
              </View>
            )}

            {/* Picker Android — abre relógio do sistema */}
            {Platform.OS === 'android' && (
              <>
                <Pressable
                  onPress={() => setShowPicker(true)}
                  style={styles.androidPickerBtn}
                >
                  <Clock size={18} color={colors.primary} />
                  <Text style={styles.androidPickerText}>
                    {time ? `Horário: ${time}  (toque para mudar)` : 'Abrir relógio do sistema'}
                  </Text>
                </Pressable>
                {showPicker && (
                  <DateTimePicker
                    value={pickerDate}
                    mode="time"
                    display="default"
                    onChange={handlePickerChange}
                    is24Hour
                  />
                )}
              </>
            )}

            {/* Web */}
            {Platform.OS === 'web' && (
              <WebTimeInput value={time} onChange={(t) => { setTime(t); if (t) setPickerDate(timeStrToDate(t)); }} />
            )}

            {/* Chips de atalho */}
            <Text style={styles.sectionLabel}>Horários rápidos</Text>
            <View style={styles.chipRow}>
              {QUICK_TIMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => handleQuickTime(t)}
                  style={[styles.chip, time === t && styles.chipActive]}
                >
                  <Text style={[styles.chipText, time === t && styles.chipTextActive]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Duração */}
            <Text style={styles.sectionLabel}>Duração estimada</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setDuration(null)}
                style={[styles.chip, duration === null && styles.chipActive]}
              >
                <Text style={[styles.chipText, duration === null && styles.chipTextActive]}>Livre</Text>
              </Pressable>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d.value}
                  onPress={() => setDuration(d.value)}
                  style={[styles.chip, duration === d.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, duration === d.value && styles.chipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              title={time ? 'Salvar' : 'Selecione um horário'}
              onPress={handleSave}
              loading={saving}
              disabled={!time}
              style={styles.saveBtn}
            />

            {initialTime && (
              <Pressable onPress={handleClear} hitSlop={8} style={styles.clearLink}>
                <Text style={styles.clearText}>Remover horário e duração</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function WebTimeInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (t: string | null) => void;
}) {
  if (Platform.OS !== 'web') return null;
  const React = require('react');
  return React.createElement('input', {
    type: 'time',
    value: value ?? '',
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
    style: {
      width: '100%',
      padding: '12px 14px',
      backgroundColor: colors.surface,
      color: value ? colors.text : colors.textMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      fontSize: 16,
      colorScheme: 'dark',
      outline: 'none',
      boxSizing: 'border-box',
      marginBottom: 16,
    },
  });
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  previewWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 40,
    fontWeight: '200',
    color: colors.text,
    letterSpacing: 2,
  },
  previewHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  pickerWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  iosPicker: {
    height: 160,
  },
  androidPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    marginBottom: spacing.xs,
  },
  androidPickerText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  saveBtn: { marginTop: spacing.md },
  clearLink: { alignItems: 'center', paddingVertical: spacing.sm },
  clearText: { color: colors.danger, fontSize: fontSize.sm },
}), [themeVersion]);
}
