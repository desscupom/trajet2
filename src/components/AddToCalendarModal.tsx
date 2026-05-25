import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { BottomSheet } from '@/components/BottomSheet';
import {
  CALENDAR_OPTIONS,
  exportTripToCalendar,
  type CalendarOption,
  type Trip,
} from '@/lib/calendarExport';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
};

export function AddToCalendarModal({ visible, trip, onClose }: Props) {
  const styles = useStyles();
  const [loading, setLoading] = useState<CalendarOption['id'] | null>(null);

  async function handleSelect(option: CalendarOption) {
    setLoading(option.id);
    await exportTripToCalendar(trip, option.id);
    setLoading(null);
    onClose();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Adicionar ao calendário"
      subtitle={trip.start_date ? `${trip.title} · ${trip.start_date}` : trip.title}
      scrollable={false}
    >
      <View style={styles.options}>
        {CALENDAR_OPTIONS.map((opt) => (
          <AnimatedPress
            key={opt.id}
            onPress={() => handleSelect(opt)}
            pressScale={0.97}
            style={styles.option}
            disabled={!!loading}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={styles.optionIcon}>{opt.icon}</Text>
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionDesc}>{opt.description}</Text>
            </View>
            {loading === opt.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.arrow}>›</Text>
            )}
          </AnimatedPress>
        ))}
      </View>
    </BottomSheet>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 32,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    sub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
    options: { padding: spacing.md, gap: spacing.xs },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionIcon: { fontSize: 28, width: 40, textAlign: 'center' },
    optionText: { flex: 1 },
    optionLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    optionDesc: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
    arrow: { color: colors.textMuted, fontSize: 22, fontWeight: '300' },
  }), [themeVersion]);
}
