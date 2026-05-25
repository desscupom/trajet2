import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FloatingInput } from '@/components/FloatingInput';
import { MapPin } from '@/components/Icon';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  spacing,
} from '@/lib/theme';

type Props = {
  title: string;
  description: string;
  onChange: (patch: { title?: string; description?: string }) => void;
};

/**
 * Step 1: pra onde / qual o nome da viagem?
 * Sugestões clicáveis pra acelerar.
 */
export function StepDestination({ title, description, onChange }: Props) {
  const styles = useStyles();
  const suggestions = [
    'Lisboa em outubro',
    'Réveillon na praia',
    'Roteiro pela Itália',
    'Tokyo 2026',
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroRow}>
        <View style={styles.iconCircle}>
          <MapPin size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Para onde você vai?</Text>
          <Text style={styles.heroSubtitle}>
            Pode ser uma cidade, país ou só um nome bonito.
          </Text>
        </View>
      </View>

      <View style={styles.fields}>
        <FloatingInput
          label="Nome da viagem"
          value={title}
          onChangeText={(v) => onChange({ title: v })}
          autoFocus
          autoCapitalize="sentences"
        />

        <FloatingInput
          label="Descrição (opcional)"
          value={description}
          onChangeText={(v) => onChange({ description: v })}
          autoCapitalize="sentences"
          multiline
          numberOfLines={3}
          style={styles.textarea}
        />
      </View>

      {!title && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsLabel}>Sugestões</Text>
          <View style={styles.chips}>
            {suggestions.map((s) => (
              <Text
                key={s}
                onPress={() => onChange({ title: s })}
                style={styles.chip}
              >
                {s}
              </Text>
            ))}
          </View>
        </View>
      )}
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
  fields: { gap: spacing.md },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  suggestions: { gap: spacing.sm },
  suggestionsLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    overflow: 'hidden',
  },
}), [themeVersion]);
}
