import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { X } from '@/components/Icon';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;

};

/**
 * Modal que aparece ao clicar no + da home.
 * Oferece 2 caminhos:
 * 1. Criar viagem → fluxo wizard existente
 * 2. Planejador financeiro → assistente de orçamento
 */
export function NewTripChoiceModal({ visible, onClose }: Props) {
  const styles = useStyles();
  const router = useRouter();

  function goToNewTrip() {
    onClose();
    setTimeout(() => router.push('/(app)/new-trip'), 100);
  }

  function goToPlanner() {
    onClose();
    setTimeout(() => router.push('/(app)/trip-planner'), 100);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView edges={['bottom']}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Nova viagem</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              Como você quer começar?
            </Text>

            {/* Opção 1 — Criar viagem normal */}
            <AnimatedPress
              onPress={goToNewTrip}
              style={styles.option}
              pressScale={0.97}
            >
              <View style={styles.optionIcon}>
                <Text style={styles.optionEmoji}>✈️</Text>
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Criar viagem</Text>
                <Text style={styles.optionDesc}>
                  Já sei o destino e quero organizar roteiro, hospedagem e gastos
                </Text>
              </View>
              <Text style={styles.optionArrow}>›</Text>
            </AnimatedPress>

            {/* Divisor */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Opção 2 — Planejador financeiro */}
            <AnimatedPress
              onPress={goToPlanner}
              style={[styles.option, styles.optionHighlight]}
              pressScale={0.97}
            >
              <View style={[styles.optionIcon, styles.optionIconHighlight]}>
                <Text style={styles.optionEmoji}>💰</Text>
              </View>
              <View style={styles.optionText}>
                <View style={styles.optionTitleRow}>
                  <Text style={[styles.optionTitle, { color: colors.primary }]}>
                    Preciso de ajuda pra me planejar
                  </Text>
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NOVO</Text>
                  </View>
                </View>
                <Text style={styles.optionDesc}>
                  Quero saber quanto vou precisar, se consigo fazer e quanto tempo levarei pra guardar
                </Text>
              </View>
              <Text style={[styles.optionArrow, { color: colors.primary }]}>›</Text>
            </AnimatedPress>

            <View style={{ height: spacing.lg }} />
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    ...shadow.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionHighlight: {
    backgroundColor: colors.primarySofter,
    borderColor: colors.primary + '40',
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconHighlight: {
    backgroundColor: colors.primarySoft,
  },
  optionEmoji: {
    fontSize: 26,
  },
  optionText: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  optionDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 3,
  },
  optionArrow: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: '300',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  newBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: {
    color: colors.primaryTextOnSolid,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
}), [themeVersion]);
}
