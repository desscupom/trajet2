import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { Calendar, Check } from '@/components/Icon';
import { formatDateLongBR } from '@/lib/dates';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

import type { TripDay } from './types';

type Props = {
  visible: boolean;
  days: TripDay[];
  currentDayId: string;
  onClose: () => void;
  onSelect: (dayId: string) => void;
};

export function PickDayModal({ visible, days, currentDayId, onClose, onSelect }: Props) {
  const styles = useStyles();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Mover pra qual dia?</Text>
          <Button title="Cancelar" variant="ghost" size="sm" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {days.map((day, index) => {
            const isCurrent = day.id === currentDayId;
            return (
              <Pressable
                key={day.id}
                disabled={isCurrent}
                onPress={() => {
                  onSelect(day.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  isCurrent && styles.rowDisabled,
                  pressed && !isCurrent && styles.rowPressed,
                ]}
              >
                <View style={styles.iconBox}>
                  <Calendar size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.dayNumber}>Dia {index + 1}</Text>
                  <Text style={styles.dayDate}>{formatDateLongBR(day.day_date)}</Text>
                </View>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Check size={14} color={colors.textMuted} />
                    <Text style={styles.currentText}>Atual</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowDisabled: { opacity: 0.5 },
  rowPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  dayNumber: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dayDate: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  currentText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500' },
}), [themeVersion]);
}
