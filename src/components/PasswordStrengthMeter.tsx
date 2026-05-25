import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { strengthMeta, validatePassword } from '@/lib/password';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Props = {
  password: string;
};

/**
 * Barra horizontal com 4 segmentos coloridos + label da força.
 * Usar SEMPRE após um input de senha em formulário de criação/alteração.
 */
export function PasswordStrengthMeter({ password }: Props) {
  const styles = useStyles();
  const { strength, error } = validatePassword(password);
  const meta = strengthMeta(strength);

  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => {
          const filled = strength > i;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                filled && { backgroundColor: meta.color },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.label, { color: error ? colors.danger : meta.color }]}>
        {error ?? meta.label}
      </Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  bars: {
    flexDirection: 'row',
    gap: 4,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
}), [themeVersion]);
}
