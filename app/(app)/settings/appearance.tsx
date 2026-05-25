import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/FadeInView';
import { Moon, Smartphone, Sun } from '@/components/Icon';
import { useTheme, type ThemePref } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

/**
 * Tela de aparência — escolhe entre Seguir sistema / Claro / Escuro.
 * Inclui preview visual de como cada tema vai ficar.
 */

type Option = {
  value: ThemePref;
  label: string;
  description: string;
  Icon: typeof Moon;
  preview: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    border: string;
  };
};

const OPTIONS: Option[] = [
  {
    value: 'system',
    label: 'Seguir sistema',
    description: 'Muda automaticamente com o tema do celular',
    Icon: Smartphone,
    preview: {
      bg: 'linear-gradient(135deg, #0a0e1a 50%, #f5f7fa 50%)',
      surface: '#fff',
      text: '#0d1117',
      textMuted: '#576175',
      primary: '#0d9488',
      border: '#dde3ed',
    },
  },
  {
    value: 'light',
    label: 'Modo claro',
    description: 'Fundo claro, ideal pra ambientes com luz',
    Icon: Sun,
    preview: {
      bg: '#f5f7fa',
      surface: '#ffffff',
      text: '#0d1117',
      textMuted: '#576175',
      primary: '#0d9488',
      border: '#dde3ed',
    },
  },
  {
    value: 'dark',
    label: 'Modo escuro',
    description: 'Fundo escuro, melhor pra ambientes com pouca luz',
    Icon: Moon,
    preview: {
      bg: '#0a0e1a',
      surface: '#161c2e',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      primary: '#14b8a6',
      border: '#2a3349',
    },
  },
];

export default function AppearanceScreen() {
  const styles = useStyles();
  const { pref, effective, setPref } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Aparência' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <FadeInView>
            <Text style={styles.intro}>
              Escolha como o Trajet aparece no seu dispositivo.
              A mudança acontece com uma transição suave.
            </Text>

            <View style={styles.optionsList}>
              {OPTIONS.map((opt) => {
                const active = pref === opt.value;
                const Icon = opt.Icon;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPref(opt.value)}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    {/* Preview mini do tema */}
                    <ThemePreview option={opt} />

                    {/* Info */}
                    <View style={styles.optionBody}>
                      <View style={styles.optionTitleRow}>
                        <Icon size={16} color={active ? colors.primary : colors.textMuted} />
                        <Text
                          style={[
                            styles.optionLabel,
                            active && styles.optionLabelActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </View>
                      <Text style={styles.optionDesc}>{opt.description}</Text>
                    </View>

                    {/* Radio */}
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {pref === 'system' && (
              <View style={styles.systemHint}>
                <Smartphone size={14} color={colors.primary} />
                <Text style={styles.systemHintText}>
                  Tema atual do sistema:{' '}
                  <Text style={styles.systemHintBold}>
                    {effective === 'light' ? 'Claro ☀️' : 'Escuro 🌙'}
                  </Text>
                </Text>
              </View>
            )}

          </FadeInView>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

/** Mini preview visual do tema */
function ThemePreview({ option }: { option: Option }) {
  const styles = useStyles();
  const p = option.preview;
  const isDual = option.value === 'system';

  return (
    <View
      style={[
        styles.preview,
        isDual
          ? styles.previewDual
          : { backgroundColor: p.bg },
      ]}
    >
      {isDual && (
        <>
          <View style={[styles.previewHalf, { backgroundColor: '#0a0e1a' }]}>
            <MiniCard bg="#161c2e" text="#f1f5f9" muted="#94a3b8" accent="#14b8a6" border="#2a3349" />
          </View>
          <View style={[styles.previewHalf, { backgroundColor: '#f5f7fa' }]}>
            <MiniCard bg="#ffffff" text="#0d1117" muted="#576175" accent="#0d9488" border="#dde3ed" />
          </View>
        </>
      )}
      {!isDual && (
        <MiniCard bg={p.surface} text={p.text} muted={p.textMuted} accent={p.primary} border={p.border} />
      )}
    </View>
  );
}

function MiniCard({
  bg, text, muted, accent, border,
}: {
  bg: string; text: string; muted: string; accent: string; border: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.miniCard, { backgroundColor: bg, borderColor: border }]}>
      {/* Barra colorida de destaque */}
      <View style={[styles.miniAccent, { backgroundColor: accent }]} />
      {/* Linhas simulando texto */}
      <View style={[styles.miniLine, { backgroundColor: text, width: '70%' }]} />
      <View style={[styles.miniLine, { backgroundColor: muted, width: '50%', marginTop: 3 }]} />
      {/* Botão simulado */}
      <View style={[styles.miniBtn, { backgroundColor: accent }]}>
        <View style={[styles.miniLine, { backgroundColor: '#fff', width: '60%' }]} />
      </View>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  optionsList: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySofter,
  },
  preview: {
    width: 72,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  previewDual: {
    flexDirection: 'row',
  },
  previewHalf: {
    flex: 1,
    padding: 6,
    justifyContent: 'center',
  },
  miniCard: {
    flex: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    padding: 5,
    overflow: 'hidden',
  },
  miniAccent: {
    height: 3,
    borderRadius: 2,
    width: '100%',
    marginBottom: 4,
  },
  miniLine: {
    height: 3,
    borderRadius: 2,
  },
  miniBtn: {
    marginTop: 5,
    height: 10,
    borderRadius: 3,
    width: '70%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1 },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 3,
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  optionLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  optionDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  systemHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySofter,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  systemHintText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  systemHintBold: {
    color: colors.text,
    fontWeight: '700',
  },
  footnote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
}), [themeVersion]);
}
