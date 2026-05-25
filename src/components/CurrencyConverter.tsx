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

import { CurrencyPicker } from '@/components/CurrencyPicker';
import { ArrowDown, X } from '@/components/Icon';
import { Input } from '@/components/Input';
import { toDbDate } from '@/lib/dates';
import {
  type CurrencyCode,
  fetchExchangeRate,
  formatCurrency,
} from '@/lib/expenses';
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
  /** Moeda base da viagem (default "to") */
  tripBaseCurrency: CurrencyCode;
};

/**
 * Conversor de moedas usando o mesmo cache de taxas que as despesas usam.
 * Útil pra usuário fazer cálculo rápido durante a viagem (sem precisar criar
 * uma despesa só pra ver quanto custa em real).
 *
 * Default: BRL → moeda base da viagem.
 * User pode trocar ambos os lados.
 */
export function CurrencyConverter({ visible, onClose, tripBaseCurrency }: Props) {
  const styles = useStyles();
  // "from" começa diferente da base pra fazer sentido (ex: viagem em EUR, query em BRL)
  const defaultFrom: CurrencyCode = tripBaseCurrency === 'BRL' ? 'USD' : 'BRL';

  const [from, setFrom] = useState<CurrencyCode>(defaultFrom);
  const [to, setTo] = useState<CurrencyCode>(tripBaseCurrency);
  const [amountStr, setAmountStr] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setFrom(defaultFrom);
      setTo(tripBaseCurrency);
      setAmountStr('');
      setRate(null);
    }
  }, [visible, tripBaseCurrency, defaultFrom]);

  // Re-fetch da taxa quando from/to mudam
  useEffect(() => {
    if (!visible) return;
    if (from === to) {
      setRate(1);
      return;
    }
    setFetching(true);
    fetchExchangeRate(from, to, toDbDate(new Date())).then((r) => {
      setRate(r);
      setFetching(false);
    });
  }, [from, to, visible]);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const amount = parseFloat(amountStr.replace(',', '.')) || 0;
  const converted = rate !== null ? amount * rate : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Conversor de moedas</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* FROM */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label="De"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              <CurrencyPicker
                value={from}
                onChange={setFrom}
                variant="inline"
              />
            </View>

            {/* SWAP */}
            <Pressable onPress={swap} style={styles.swapBtn} hitSlop={6}>
              <ArrowDown size={18} color={colors.primary} />
            </Pressable>

            {/* TO */}
            <View style={styles.row}>
              <View style={[styles.resultBox, { flex: 1 }]}>
                <Text style={styles.resultLabel}>Equivale a</Text>
                {fetching ? (
                  <Text style={styles.resultPlaceholder}>Buscando taxa…</Text>
                ) : rate === null ? (
                  <Text style={styles.resultPlaceholder}>Sem cotação</Text>
                ) : amount === 0 ? (
                  <Text style={styles.resultPlaceholder}>—</Text>
                ) : (
                  <Text style={styles.resultValue}>
                    {formatCurrency(converted ?? 0, to)}
                  </Text>
                )}
              </View>
              <CurrencyPicker
                value={to}
                onChange={setTo}
                variant="inline"
              />
            </View>

            {/* Taxa atual (info) */}
            {rate !== null && rate !== 1 && (
              <Text style={styles.rateNote}>
                1 {from} = {rate.toFixed(4)} {to}
              </Text>
            )}
          </ScrollView>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  body: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  swapBtn: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  resultLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  resultValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  resultPlaceholder: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontStyle: 'italic',
  },
  rateNote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}
