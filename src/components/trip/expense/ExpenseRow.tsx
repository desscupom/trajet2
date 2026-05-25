/**
 * ExpenseRow — card de uma despesa na lista do ExpensesTab.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { X } from '@/components/Icon';
import { getIconByName } from '@/lib/expenseIcons';
import { formatCurrency } from '@/lib/expenses';
import { formatDateBR } from '@/lib/dates';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { Expense } from './types';

type Props = {
  expense: Expense;
  payerName: string;
  tripBaseCurrency: string;
  iconName: string | undefined;
  onEdit: () => void;
  onRemove: () => void;
};

export function ExpenseRow({ expense, payerName, tripBaseCurrency, iconName, onEdit, onRemove }: Props) {
  const styles = useStyles();
  const Icon = getIconByName(iconName);
  const isForeignCurrency = expense.currency !== tripBaseCurrency;
  const isInstallment = (expense as any).payment_type === 'parcelado';
  const installNum = (expense as any).installment_number;
  const installTotal = (expense as any).installments_total;

  return (
    <View style={styles.expenseRow}>
      <Pressable onPress={onEdit} style={styles.expenseTapArea} android_ripple={{ color: colors.surfaceAlt }}>
        <View style={styles.expenseIcon}>
          <Icon size={18} color={colors.primary} />
        </View>
        <View style={styles.expenseContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.expenseTitle} numberOfLines={1}>{expense.description}</Text>
            {isInstallment && (
              <View style={styles.installBadge}>
                <Text style={styles.installBadgeText}>{installNum}/{installTotal}x</Text>
              </View>
            )}
            {(expense as any).notes && <View style={styles.notesDot} />}
          </View>
          <Text style={styles.expenseMeta} numberOfLines={1}>
            {payerName} pagou • {formatDateBR(expense.expense_date)}
          </Text>
        </View>
        <View style={styles.expenseAmount}>
          <Text style={styles.expenseValueBase}>{formatCurrency(expense.amount_in_base, tripBaseCurrency)}</Text>
          {isForeignCurrency && (
            <Text style={styles.expenseValueOriginal}>{formatCurrency(expense.amount, expense.currency)}</Text>
          )}
        </View>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    expenseRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg },
    expenseTapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.sm },
    expenseIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
    expenseContent: { flex: 1, gap: 2 },
    expenseTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    expenseMeta: { color: colors.textMuted, fontSize: fontSize.xs },
    expenseAmount: { alignItems: 'flex-end', gap: 2 },
    expenseValueBase: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
    expenseValueOriginal: { color: colors.textMuted, fontSize: fontSize.xs },
    removeBtn: { padding: spacing.md },
    installBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 2 },
    installBadgeText: { color: colors.primary, fontSize: 9, fontWeight: '800' },
    notesDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, marginTop: 1 },
  }), [themeVersion]);
}
