import {useState, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';

import { ChevronDown } from '@/components/Icon';
import { BottomSheet } from '@/components/BottomSheet';
import { Flag } from '@/components/Flag';
import { CURRENCIES, type CurrencyCode } from '@/lib/expenses';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Props = {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  /** Estilo: 'inline' (botão chip) ou 'block' (input full-width como Input) */
  variant?: 'inline' | 'block';
  label?: string;
  disabled?: boolean;
};

/**
 * Picker de moeda com bandeiras.
 *
 * - 'inline': botão pequeno (chip) — pra usar lado a lado com input de valor
 * - 'block': bloco full-width estilo Input — pra forms de configuração
 */
export function CurrencyPicker({
  value,
  onChange,
  variant = 'inline',
  label,
  disabled,
}: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  const current = CURRENCIES.find((c) => c.code === value) ?? CURRENCIES[0];

  return (
    <>
      {variant === 'inline' ? (
        <Pressable
          onPress={() => !disabled && setOpen(true)}
          style={[styles.inlineBtn, disabled && styles.disabled]}
          disabled={disabled}
        >
          <Flag country={current.country} size={20} />
          <Text style={styles.inlineCode}>{current.code}</Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
      ) : (
        <View style={styles.blockWrap}>
          {label && <Text style={styles.blockLabel}>{label}</Text>}
          <Pressable
            onPress={() => !disabled && setOpen(true)}
            style={[styles.blockBtn, disabled && styles.disabled]}
            disabled={disabled}
          >
            <Flag country={current.country} size={28} />
            <View style={styles.blockTextWrap}>
              <Text style={styles.blockCode}>{current.code}</Text>
              <Text style={styles.blockName}>{current.name}</Text>
            </View>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Modal de seleção */}
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Escolher moeda"
      >
        <ScrollView style={{ maxHeight: 400 }}>
          {CURRENCIES.map((curr) => {
            const active = curr.code === value;
            return (
              <Pressable
                key={curr.code}
                onPress={() => { onChange(curr.code); setOpen(false); }}
                style={[styles.row, active && styles.rowActive]}
              >
                <Flag country={curr.country} size={32} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowCode, active && { color: colors.primary }]}>{curr.code}</Text>
                  <Text style={styles.rowName}>{curr.name}</Text>
                </View>
                <Text style={styles.rowSymbol}>{curr.symbol}</Text>
                {active && <Text style={{ color: colors.primary, fontSize: 16 }}>✓</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  inlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  inlineCode: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  disabled: { opacity: 0.5 },
  blockWrap: { gap: spacing.xs },
  blockLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  blockTextWrap: { flex: 1 },
  blockCode: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  blockName: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  // Modal/sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadow.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  list: { paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rowActive: {
    backgroundColor: colors.primarySoft,
  },
  rowText: { flex: 1 },
  rowCode: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  rowName: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  rowSymbol: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'right',
  },
}), [themeVersion]);
}
