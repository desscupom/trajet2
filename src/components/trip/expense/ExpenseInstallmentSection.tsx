/**
 * ExpenseInstallmentSection — seletor de parcelamento no AddExpenseModal.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  paymentType: 'avista' | 'parcelado';
  installmentsTotal: number;
  installmentDueDay: number;
  expenseDate: string;
  amount: number;
  currency: string;
  splitWithSize: number;
  onChangePaymentType: (t: 'avista' | 'parcelado') => void;
  onChangeInstallments: (n: number) => void;
  onChangeDueDay: (d: number) => void;
};

export function ExpenseInstallmentSection({
  paymentType, installmentsTotal, installmentDueDay,
  expenseDate, amount, currency, splitWithSize,
  onChangePaymentType, onChangeInstallments, onChangeDueDay,
}: Props) {
  const styles = useStyles();

  return (
    <View>
      <Text style={styles.fieldLabel}>Forma de pagamento</Text>
      <View style={styles.paymentToggleRow}>
        <Pressable
          style={[styles.paymentBtn, paymentType === 'avista' && styles.paymentBtnActive]}
          onPress={() => onChangePaymentType('avista')}
        >
          <Text style={[styles.paymentBtnText, paymentType === 'avista' && styles.paymentBtnTextActive]}>
            💵 À vista
          </Text>
        </Pressable>
        <Pressable
          style={[styles.paymentBtn, paymentType === 'parcelado' && styles.paymentBtnActive]}
          onPress={() => onChangePaymentType('parcelado')}
        >
          <Text style={[styles.paymentBtnText, paymentType === 'parcelado' && styles.paymentBtnTextActive]}>
            💳 Parcelado
          </Text>
        </Pressable>
      </View>

      {paymentType === 'parcelado' && (
        <View style={styles.installmentBox}>
          <View style={styles.installmentRow}>
            <Text style={styles.installmentLabel}>Número de parcelas</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => onChangeInstallments(Math.max(2, installmentsTotal - 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{installmentsTotal}x</Text>
              <Pressable onPress={() => onChangeInstallments(Math.min(36, installmentsTotal + 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.installmentRow}>
            <Text style={styles.installmentLabel}>Dia de vencimento</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => onChangeDueDay(Math.max(1, installmentDueDay - 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>dia {installmentDueDay}</Text>
              <Pressable onPress={() => onChangeDueDay(Math.min(31, installmentDueDay + 1))} style={styles.stepperBtn}>
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Parcelas:</Text>
            {Array.from({ length: Math.min(installmentsTotal, 6) }, (_, i) => {
              const d = new Date(expenseDate + 'T12:00:00');
              d.setMonth(d.getMonth() + i);
              d.setDate(installmentDueDay);
              const perPerson = amount / (splitWithSize || 1) / installmentsTotal;
              return (
                <Text key={i} style={styles.previewLine}>
                  {i + 1}ª — {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  {perPerson > 0 ? `  ·  ${currency} ${perPerson.toFixed(2)} p/ pessoa` : ''}
                </Text>
              );
            })}
            {installmentsTotal > 6 && (
              <Text style={styles.previewLine}>...e mais {installmentsTotal - 6} parcelas</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    fieldLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
    paymentToggleRow: { flexDirection: 'row', gap: spacing.sm },
    paymentBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    paymentBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    paymentBtnText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
    paymentBtnTextActive: { color: '#fff' },
    installmentBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.md },
    installmentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    installmentLabel: { color: colors.textMuted, fontSize: fontSize.sm },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepperBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepperText: { color: colors.text, fontSize: 18, fontWeight: '600', lineHeight: 20 },
    stepperValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', minWidth: 60, textAlign: 'center' },
    preview: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm, gap: 4 },
    previewTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', marginBottom: 2 },
    previewLine: { color: colors.text, fontSize: fontSize.xs, lineHeight: 18 },
  }), [themeVersion]);
}
