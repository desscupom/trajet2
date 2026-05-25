/**
 * MoneyInput — campo de valor monetário com formatação automática.
 * - Mostra símbolo da moeda à esquerda
 * - Formata com separador de milhar e 2 casas decimais durante a digitação
 * - Valor interno sem formatação para uso no código
 * - Suporte a tecla backspace correta
 */
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$', USD: '$', EUR: '€', ARS: '$', CLP: '$', COP: '$',
  MXN: '$', PYG: '₲', PEN: 'S/', UYU: '$', GBP: '£', JPY: '¥',
  CAD: 'CA$', AUD: 'A$', CHF: 'Fr', CNY: '¥', INR: '₹',
};

type Props = {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function MoneyInput({
  value,
  onChange,
  currency = 'BRL',
  label,
  placeholder = '0,00',
  autoFocus = false,
}: Props) {
  const styles = useStyles();
  const inputRef = useRef<TextInput>(null);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;

  // Mantém string interna de dígitos (sem separadores)
  // 1234 = R$ 12,34
  const [rawDigits, setRawDigits] = useState<string>(() => {
    if (!value) return '';
    return Math.round(value * 100).toString();
  });

  function formatDisplay(digits: string): string {
    if (!digits) return '';
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function handleChangeText(text: string) {
    // Remove tudo que não é dígito
    const digits = text.replace(/\D/g, '');
    // Limita a 10 dígitos (99.999.999,99)
    const limited = digits.slice(0, 10);
    setRawDigits(limited);
    const numericValue = limited ? parseInt(limited, 10) / 100 : 0;
    onChange(numericValue);
  }

  const displayValue = formatDisplay(rawDigits);

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={styles.container}
        onPress={() => inputRef.current?.focus()}
      >
        <Text style={styles.symbol}>{symbol}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={displayValue}
          onChangeText={handleChangeText}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          selectTextOnFocus
          caretHidden={false}
        />
        {!!rawDigits && (
          <Pressable
            onPress={() => { setRawDigits(''); onChange(0); }}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    label: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '600',
      marginBottom: spacing.xs,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      minHeight: 52,
      gap: spacing.xs,
    },
    symbol: {
      color: colors.textMuted,
      fontSize: fontSize.md,
      fontWeight: '600',
      minWidth: 28,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.xl,
      fontWeight: '700',
      letterSpacing: -0.5,
      paddingVertical: spacing.sm,
    },
    clearBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearText: {
      color: colors.textMuted,
      fontSize: 16,
      lineHeight: 18,
    },
  }), [themeVersion]);
}
