/**
 * settings/safety.tsx — Preferências de Alertas de Segurança
 */
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/hooks/useAuth';
import { useSafetyPrefs } from '@/hooks/useSafetyPrefs';
import { SAFETY_ALERT_LABELS, type SafetyAlertType } from '@/hooks/usePlaceSafety';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const GROUPS = [
  {
    title: 'Riscos pessoais',
    types: ['unsafe_women', 'unsafe_lgbtq', 'unsafe_children', 'unsafe_night'] as SafetyAlertType[],
  },
  {
    title: 'Segurança geral',
    types: ['unsafe_general', 'scam'] as SafetyAlertType[],
  },
  {
    title: 'Informações do lugar',
    types: ['poor_accessibility', 'overcrowded', 'closed_permanently', 'different_from_photos'] as SafetyAlertType[],
  },
];

export default function SafetyPrefsScreen() {
  const styles = useStyles();
  const { user } = useAuth();
  const { prefs, toggle } = useSafetyPrefs(user?.id ?? null);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Alertas de segurança' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Escolha quais tipos de alerta de segurança deseja ver ao visualizar locais no roteiro.
          Outros viajantes reportam esses alertas para ajudar a comunidade.
        </Text>

        {GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.types.map((type) => {
              const info = SAFETY_ALERT_LABELS[type];
              return (
                <View key={type} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowIcon}>{info.icon}</Text>
                    <Text style={styles.rowLabel}>{info.label}</Text>
                  </View>
                  <Switch
                    value={prefs[type]}
                    onValueChange={() => toggle(type)}
                    trackColor={{ true: colors.primary }}
                    thumbColor={prefs[type] ? '#fff' : colors.textMuted}
                  />
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer}>
          Suas preferências são salvas automaticamente e aplicadas em todas as viagens.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
    intro: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
    group: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    groupTitle: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    rowIcon: { fontSize: 18 },
    rowLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', flex: 1 },
    footer: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  }), [themeVersion]);
}
