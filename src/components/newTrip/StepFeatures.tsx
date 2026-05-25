import { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Compass,
  Hotel,
  ListChecks,
  MapPin,
  Route,
  Sparkles,
  Wallet,
  FileText,
} from '@/components/Icon';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type FeatureKey = 'itinerary' | 'lodging' | 'places' | 'expenses' | 'tasks' | 'transports' | 'documents';

type Props = {
  features: Record<FeatureKey, boolean>;
  onToggle: (key: FeatureKey, value: boolean) => void;
};

const FEATURES: {
  key: FeatureKey;
  title: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}[] = [
  {
    key: 'itinerary',
    title: 'Roteiro por dia',
    description: 'Organize lugares, horários e atividades dia a dia',
    Icon: Compass,
  },
  {
    key: 'lodging',
    title: 'Hospedagem',
    description: 'Hotéis, Airbnbs, casas — datas de check-in e check-out',
    Icon: Hotel,
  },
  {
    key: 'places',
    title: 'Mapa de lugares',
    description: 'Salve restaurantes, pontos turísticos e veja no mapa',
    Icon: MapPin,
  },
  {
    key: 'expenses',
    title: 'Despesas compartilhadas',
    description: 'Divida gastos com o grupo, em qualquer moeda',
    Icon: Wallet,
  },
  {
    key: 'tasks',
    title: 'Lista de tarefas',
    description: 'Lembretes pré-viagem (visto, vacinas, fazer mala)',
    Icon: ListChecks,
  },
  {
    key: 'transports',
    title: 'Transportes',
    description: 'Voos, trens, ônibus — horários e reservas numa linha do tempo',
    Icon: Route,
  },
  {
    key: 'documents',
    title: 'Documentos',
    description: 'Passagens, vouchers, seguro viagem e outros arquivos',
    Icon: FileText,
  },
];

/**
 * Step 3: o que vai usar nessa viagem?
 * Cards toggláveis. Pelo menos um precisa estar ativo (validação no parent).
 */
export function StepFeatures({ features, onToggle }: Props) {
  const styles = useStyles();
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroRow}>
        <View style={styles.iconCircle}>
          <Sparkles size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>O que vai usar?</Text>
          <Text style={styles.heroSubtitle}>
            Ative só o que precisa. Dá pra mudar depois nas configurações da
            viagem.
          </Text>
        </View>
      </View>

      <View style={styles.cards}>
        {FEATURES.map((f) => {
          const active = features[f.key];
          const Icon = f.Icon;
          return (
            <View
              key={f.key}
              style={[styles.card, active && styles.cardActive]}
            >
              <View
                style={[styles.cardIcon, active && styles.cardIconActive]}
              >
                <Icon
                  size={20}
                  color={active ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardDescription}>{f.description}</Text>
              </View>
              <Switch
                value={active}
                onValueChange={(v) => onToggle(f.key, v)}
                trackColor={{
                  false: colors.surfaceAlt,
                  true: colors.primary,
                }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
      </View>
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
  cards: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfacePremium,
    ...shadow.sm,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconActive: {
    backgroundColor: colors.primarySoft,
  },
  cardText: { flex: 1 },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
}), [themeVersion]);
}
