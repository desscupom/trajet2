import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ChevronLeft } from '@/components/Icon';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  canAdvance: boolean;
  loading: boolean;
  isLast: boolean;
};

const STEP_LABELS = ['Destino', 'Quando', 'Recursos', 'Capa'];

/**
 * Cabeçalho fixo do wizard:
 * - Botão voltar à esquerda
 * - Progress dots no meio
 * - Botão "Próximo" / "Criar" à direita
 */
export function StepHeader({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  canAdvance,
  loading,
  isLast,
}: Props) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>

        <View style={styles.dotsWrap}>
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentStep && styles.dotActive,
                idx < currentStep && styles.dotPast,
              ]}
            />
          ))}
        </View>

        <Button
          title={isLast ? 'Criar' : 'Próximo'}
          variant="primary"
          size="sm"
          onPress={onNext}
          disabled={!canAdvance || loading}
          loading={loading}
        />
      </View>
      <Text style={styles.stepLabel}>
        {STEP_LABELS[currentStep]} · Etapa {currentStep + 1} de {totalSteps}
      </Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  dotsWrap: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
  },
  dotPast: {
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
}), [themeVersion]);
}
