/**
 * SmartTimeModal — aparece ao adicionar um lugar no roteiro.
 *
 * Busca o horário de funcionamento do lugar via OSM,
 * analisa os itens já no dia e sugere o melhor horário disponível.
 * User pode aceitar a sugestão, escolher outro horário, ou pular.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Clock } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import {
  fetchOpeningHours,
  suggestBestTime,
  type OpeningHours,
  type ScheduledItem,
} from '@/lib/places';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const QUICK_TIMES = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00',
];

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1h', value: 60 },
  { label: '1h30', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];

type Props = {
  visible: boolean;
  itemId: string;
  placeName: string;
  placeExternalId: string;
  placeCategory: string | null;
  dayId: string;
  onSave: (time: string, duration: number | null) => void;
  onSkip: () => void;
};

export function SmartTimeModal({
  visible, itemId, placeName, placeExternalId, placeCategory,
  dayId, onSave, onSkip,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<OpeningHours | null>(null);
  const [suggestion, setSuggestion] = useState<{ time: string; reason: string } | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    analyze();
  }, [visible, dayId, placeExternalId]);

  async function analyze() {
    setLoading(true);
    try {
      // Busca itens já no dia
      const { data: dayItems } = await supabase
        .from('itinerary_items')
        .select('id, start_time, duration_minutes')
        .eq('trip_day_id', dayId)
        .neq('id', itemId); // exclui o item recém-adicionado

      const existing: ScheduledItem[] = (dayItems ?? []).map((it) => ({
        id: it.id,
        start_time: it.start_time,
        duration_minutes: it.duration_minutes,
      }));

      // Busca horários de funcionamento em paralelo com a análise
      const oh = await fetchOpeningHours(placeExternalId, placeCategory);
      setHours(oh);

      const dur = oh.defaultDuration;
      setSelectedDuration(dur);

      const sugg = suggestBestTime(existing, oh, dur);
      setSuggestion(sugg);
      setSelectedTime(sugg.time);
    } catch {
      // fallback
      setSuggestion({ time: '10:00', reason: 'Horário padrão' });
      setSelectedTime('10:00');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedTime) return;
    setSaving(true);
    await supabase
      .from('itinerary_items')
      .update({
        start_time: `${selectedTime}:00`,
        duration_minutes: selectedDuration,
      })
      .eq('id', itemId);
    setSaving(false);
    onSave(selectedTime, selectedDuration);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onSkip}
    >
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIcon}>
            <Clock size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Quando você vai?</Text>
            <Text style={s.headerSub} numberOfLines={1}>{placeName}</Text>
          </View>
          <Pressable onPress={onSkip} hitSlop={10} style={s.skipX}>
            <Text style={s.skipXText}>Depois</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.loadingText}>Analisando sua agenda e horários do lugar...</Text>
          </View>
        ) : (
          <>
            {/* Sugestão principal */}
            {suggestion && (
              <View style={s.suggestionCard}>
                <View style={s.suggestionBadge}>
                  <Text style={s.suggestionBadgeText}>✨ Sugestão inteligente</Text>
                </View>
                <Text style={s.suggestionTime}>{selectedTime ?? suggestion.time}</Text>
                <Text style={s.suggestionReason}>{suggestion.reason}</Text>

                {/* Horário de funcionamento */}
                {hours?.todayLabel && (
                  <View style={s.hoursRow}>
                    <Text style={s.hoursIcon}>🕐</Text>
                    <Text style={s.hoursText}>{hours.todayLabel}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Chips de horário */}
            <Text style={s.sectionLabel}>Outro horário</Text>
            <View style={s.chipsWrap}>
              {QUICK_TIMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setSelectedTime(t)}
                  style={[s.chip, selectedTime === t && s.chipActive]}
                >
                  <Text style={[s.chipText, selectedTime === t && s.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            {/* Duração */}
            <Text style={s.sectionLabel}>Duração estimada</Text>
            <View style={s.chipsWrap}>
              <Pressable
                onPress={() => setSelectedDuration(null)}
                style={[s.chip, selectedDuration === null && s.chipActive]}
              >
                <Text style={[s.chipText, selectedDuration === null && s.chipTextActive]}>Livre</Text>
              </Pressable>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d.value}
                  onPress={() => setSelectedDuration(d.value)}
                  style={[s.chip, selectedDuration === d.value && s.chipActive]}
                >
                  <Text style={[s.chipText, selectedDuration === d.value && s.chipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Ações */}
            <View style={s.actions}>
              <Button
                title={saving ? 'Salvando...' : `Confirmar ${selectedTime ?? ''}${selectedDuration ? ` · ${DURATION_OPTIONS.find(d=>d.value===selectedDuration)?.label ?? ''}` : ''}`}
                onPress={handleSave}
                loading={saving}
                disabled={!selectedTime}
                fullWidth
              />
              <Pressable onPress={onSkip} style={s.skipBtn}>
                <Text style={s.skipText}>Definir horário depois</Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  skipX: { padding: spacing.xs },
  skipXText: { color: colors.textMuted, fontSize: fontSize.sm },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  suggestionCard: {
    margin: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestionBadge: {
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  suggestionBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  suggestionTime: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: -1,
    lineHeight: 56,
  },
  suggestionReason: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hoursIcon: { fontSize: 13 },
  hoursText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '500' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
  chipText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  actions: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    marginTop: 'auto' as any,
  },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textMuted, fontSize: fontSize.sm },
});
