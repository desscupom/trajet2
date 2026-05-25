/**
 * ExpenseSplitSection — seção "Como dividir" do AddExpenseModal.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { formatCurrency } from '@/lib/expenses';
import type { SplitMode, SplitResult } from '@/lib/splitExpense';
import type { TripMemberWithProfile } from '@/hooks/useTripMembers';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export const SPLIT_MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal',   label: 'Igual' },
  { value: 'amount',  label: 'Por valor' },
  { value: 'percent', label: 'Por %' },
];

type Props = {
  members: TripMemberWithProfile[];
  currency: string;
  amount: number;
  amountValid: boolean;
  splitMode: SplitMode;
  splitWith: Set<string>;
  splitValues: Record<string, string>;
  splitResult: SplitResult;
  percentageSum: number;
  onChangeSplitMode: (m: SplitMode) => void;
  onToggleMember: (id: string) => void;
  onChangeSplitValue: (id: string, v: string) => void;
};

export function ExpenseSplitSection({
  members, currency, amount, amountValid,
  splitMode, splitWith, splitValues,
  splitResult, percentageSum,
  onChangeSplitMode, onToggleMember, onChangeSplitValue,
}: Props) {
  const styles = useStyles();

  return (
    <View style={styles.splitCard}>
      <Text style={styles.splitTitle}>Como dividir</Text>
      <View style={styles.segmented}>
        {SPLIT_MODES.map((m) => (
          <Pressable
            key={m.value}
            onPress={() => onChangeSplitMode(m.value)}
            style={[styles.segmentBtn, splitMode === m.value && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, splitMode === m.value && styles.segmentTextActive]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.memberList}>
        {members.map((m) => {
          const name = m.profile?.full_name || m.profile?.email || '?';
          const checked = splitWith.has(m.profile_id);
          const valueStr = splitValues[m.profile_id] ?? '';
          const calculatedShare = splitResult.sharesOriginal[m.profile_id] ?? 0;

          if (splitMode === 'equal') {
            return (
              <Pressable key={m.profile_id} onPress={() => onToggleMember(m.profile_id)} style={styles.memberRow}>
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.memberName}>{name}</Text>
                {checked && amountValid && <Text style={styles.memberShare}>{formatCurrency(calculatedShare, currency)}</Text>}
              </Pressable>
            );
          }
          if (splitMode === 'amount') {
            return (
              <View key={m.profile_id} style={styles.memberRow}>
                <Text style={styles.memberName}>{name}</Text>
                <View style={styles.amountInputWrap}>
                  <TextInput value={valueStr} onChangeText={(v) => onChangeSplitValue(m.profile_id, v)}
                    placeholder="0,00" placeholderTextColor={colors.textDisabled}
                    keyboardType="decimal-pad" style={styles.amountInput} />
                  <Text style={styles.amountUnit}>{currency}</Text>
                </View>
              </View>
            );
          }
          return (
            <View key={m.profile_id} style={styles.memberRow}>
              <Text style={styles.memberName}>{name}</Text>
              <View style={styles.amountInputWrap}>
                <TextInput value={valueStr} onChangeText={(v) => onChangeSplitValue(m.profile_id, v)}
                  placeholder="0" placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad" style={styles.amountInput} />
                <Text style={styles.amountUnit}>%</Text>
                {amountValid && <Text style={styles.percentPreview}>≈ {formatCurrency(calculatedShare, currency)}</Text>}
              </View>
            </View>
          );
        })}
      </View>
      {amountValid && (
        <View style={[styles.allocationFooter, splitResult.isValid && styles.allocationValid]}>
          {splitMode === 'equal' && (
            <Text style={styles.allocationText}>{splitWith.size} {splitWith.size === 1 ? 'pessoa' : 'pessoas'} dividindo</Text>
          )}
          {splitMode === 'amount' && (
            <Text style={[styles.allocationText, !splitResult.isValid && styles.allocationWarn]}>
              {splitResult.isValid ? '✓ Tudo alocado'
                : `${formatCurrency(splitResult.totalAllocated, currency)} de ${formatCurrency(amount, currency)} (${splitResult.remaining > 0 ? 'falta' : 'passou'} ${formatCurrency(Math.abs(splitResult.remaining), currency)})`}
            </Text>
          )}
          {splitMode === 'percent' && (
            <Text style={[styles.allocationText, Math.abs(percentageSum - 100) >= 0.01 && styles.allocationWarn]}>
              {Math.abs(percentageSum - 100) < 0.01 ? '✓ Soma 100%' : `${percentageSum.toFixed(1)}% de 100% alocados`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    splitCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    splitTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    segmented: { flexDirection: 'row', margin: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
    segmentBtnActive: { backgroundColor: colors.bg },
    segmentText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' },
    segmentTextActive: { color: colors.text, fontWeight: '700' },
    memberList: { borderTopWidth: 1, borderTopColor: colors.border },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
    memberName: { flex: 1, color: colors.text, fontSize: fontSize.sm },
    memberShare: { color: colors.textMuted, fontSize: fontSize.sm },
    amountInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    amountInput: { color: colors.text, fontSize: fontSize.sm, borderBottomWidth: 1, borderBottomColor: colors.border, minWidth: 60, paddingVertical: 2, textAlign: 'right' },
    amountUnit: { color: colors.textMuted, fontSize: fontSize.xs },
    percentPreview: { color: colors.textMuted, fontSize: fontSize.xs, marginLeft: 4 },
    allocationFooter: { padding: spacing.md, backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderTopColor: colors.border },
    allocationValid: { backgroundColor: colors.successSoft },
    allocationText: { color: colors.textMuted, fontSize: fontSize.xs },
    allocationWarn: { color: colors.warning },
  }), [themeVersion]);
}
