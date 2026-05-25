import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CurrencyPicker } from '@/components/CurrencyPicker';
import { DateField } from '@/components/DateField';
import { Calendar } from '@/components/Icon';
import { datesBetween } from '@/lib/dates';
import { type CurrencyCode } from '@/lib/expenses';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  onChange: (patch: {
    startDate?: string | null;
    endDate?: string | null;
    baseCurrency?: string;
  }) => void;
};

/**
 * Step 2: quando vai? Datas opcionais.
 * Mostra preview "X dias" quando ambas preenchidas.
 * Lista de moedas como chips.
 */
export function StepDates({
  startDate,
  endDate,
  baseCurrency,
  onChange,
}: Props) {
  const styles = useStyles();
  const daysCount =
    startDate && endDate ? datesBetween(startDate, endDate).length : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroRow}>
        <View style={styles.iconCircle}>
          <Calendar size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Quando vai ser?</Text>
          <Text style={styles.heroSubtitle}>
            Pode pular se ainda não decidiu. Dá pra adicionar depois.
          </Text>
        </View>
      </View>

      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <DateField
            label="Início"
            value={startDate}
            onChange={(d) => onChange({ startDate: d })}
            optional
          />
        </View>
        <View style={styles.dateField}>
          <DateField
            label="Fim"
            value={endDate}
            onChange={(d) => onChange({ endDate: d })}
            minDate={startDate}
            optional
          />
        </View>
      </View>

      {daysCount !== null && (
        <View style={styles.daysPreview}>
          <Text style={styles.daysPreviewText}>
            {daysCount} {daysCount === 1 ? 'dia' : 'dias'} de viagem 🎒
          </Text>
        </View>
      )}

      <View style={styles.moeda}>
        <Text style={styles.label}>Moeda principal</Text>
        <Text style={styles.hint}>
          Usada nas despesas. Pode adicionar despesas em outras moedas depois.
        </Text>
        <CurrencyPicker
          value={baseCurrency as CurrencyCode}
          onChange={(code) => onChange({ baseCurrency: code })}
          variant="block"
        />
      </View>
    </ScrollView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: { paddingBottom: spacing.xxxl, gap: spacing.xl },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: { flex: 1 },
  daysPreview: {
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  daysPreviewText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  moeda: { gap: spacing.sm },
  label: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: letterSpacing.tight,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
}), [themeVersion]);
}
