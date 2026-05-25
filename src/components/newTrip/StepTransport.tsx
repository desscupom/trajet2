/**
 * StepTransport — passo de criação de viagem para definir os meios de transporte.
 * Permite selecionar múltiplos meios e, para carro, configura dados de rota.
 */
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatedPress } from '@/components/AnimatedPress';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { TransportType } from '@/components/trip/TransportModal';

export type TransportModeConfig = {
  modes: TransportType[];
  primaryMode: TransportType;
  // Para carro
  totalKm?: string;
  fuelEfficiency?: string;
  fuelPricePerLiter?: string;
  estimatedTollCost?: string;
};

type ModeOption = {
  type: TransportType;
  icon: string;
  label: string;
  description: string;
};

const MODES: ModeOption[] = [
  { type: 'flight',    icon: '✈️', label: 'Avião',      description: 'Voos nacionais ou internacionais' },
  { type: 'car',       icon: '🚗', label: 'Carro',      description: 'Road trip, viagem própria ou alugado' },
  { type: 'bus',       icon: '🚌', label: 'Ônibus',     description: 'Rodoviária, ônibus fretado' },
  { type: 'train',     icon: '🚆', label: 'Trem',       description: 'Trem de alta velocidade, regional' },
  { type: 'ferry',     icon: '⛴️', label: 'Barco',     description: 'Cruzeiro, balsa, lancha' },
  { type: 'rideshare', icon: '🚙', label: 'Uber / App', description: 'Aplicativo de transporte' },
  { type: 'bicycle',   icon: '🚴', label: 'Bicicleta',  description: 'Cicloturismo, bike compartilhada' },
  { type: 'walking',   icon: '🚶', label: 'A pé',       description: 'Trekking, caminhada, trilha' },
  { type: 'other',     icon: '🚀', label: 'Outro',      description: 'Helicóptero, teleférico, etc.' },
];

type Props = {
  value: TransportModeConfig;
  onChange: (v: TransportModeConfig) => void;
};

export function StepTransport({ value, onChange }: Props) {
  const styles = useStyles();
  const hasCar = value.modes.includes('car');

  function toggleMode(type: TransportType) {
    const already = value.modes.includes(type);
    let newModes = already
      ? value.modes.filter((m) => m !== type)
      : [...value.modes, type];
    if (newModes.length === 0) newModes = [type]; // sempre pelo menos 1
    const primary = newModes.includes(value.primaryMode) ? value.primaryMode : newModes[0];
    onChange({ ...value, modes: newModes, primaryMode: primary });
  }

  function setPrimary(type: TransportType) {
    if (!value.modes.includes(type)) return;
    onChange({ ...value, primaryMode: type });
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Como vai viajar?</Text>
      <Text style={styles.subtitle}>
        Selecione um ou mais meios de transporte. Isso ajuda a montar o roteiro e estimar custos.
      </Text>

      {/* Seletor de modos */}
      <View style={styles.grid}>
        {MODES.map((m) => {
          const selected = value.modes.includes(m.type);
          const isPrimary = value.primaryMode === m.type;
          return (
            <AnimatedPress
              key={m.type}
              onPress={() => toggleMode(m.type)}
              onLongPress={() => selected && setPrimary(m.type)}
              pressScale={0.95}
              style={[styles.modeCard, selected && styles.modeCardSelected]}
            >
              <Text style={styles.modeIcon}>{m.icon}</Text>
              <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{m.label}</Text>
              <Text style={styles.modeDesc} numberOfLines={2}>{m.description}</Text>
              {selected && isPrimary && value.modes.length > 1 && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>principal</Text>
                </View>
              )}
              {selected && (
                <View style={styles.checkMark}>
                  <Text style={styles.checkMarkText}>✓</Text>
                </View>
              )}
            </AnimatedPress>
          );
        })}
      </View>

      {value.modes.length > 1 && (
        <Text style={styles.hint}>Segure para definir o transporte principal</Text>
      )}

      {/* Configurações extras para carro */}
      {hasCar && (
        <View style={styles.carSection}>
          <Text style={styles.carTitle}>🚗 Configurar road trip</Text>
          <Text style={styles.carSubtitle}>
            Informe os dados para estimativa de custos com combustível e pedágios.
          </Text>

          <View style={styles.carFields}>
            <View style={styles.carField}>
              <Text style={styles.fieldLabel}>Distância estimada (km)</Text>
              <TextInput
                style={styles.fieldInput}
                value={value.totalKm}
                onChangeText={(t) => onChange({ ...value, totalKm: t })}
                keyboardType="decimal-pad"
                placeholder="ex: 850"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.carField}>
              <Text style={styles.fieldLabel}>Consumo do carro (km/L)</Text>
              <TextInput
                style={styles.fieldInput}
                value={value.fuelEfficiency}
                onChangeText={(t) => onChange({ ...value, fuelEfficiency: t })}
                keyboardType="decimal-pad"
                placeholder="ex: 12"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.carField}>
              <Text style={styles.fieldLabel}>Preço da gasolina (R$/L)</Text>
              <TextInput
                style={styles.fieldInput}
                value={value.fuelPricePerLiter}
                onChangeText={(t) => onChange({ ...value, fuelPricePerLiter: t })}
                keyboardType="decimal-pad"
                placeholder="ex: 6.50"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.carField}>
              <Text style={styles.fieldLabel}>Estimativa de pedágios (R$)</Text>
              <TextInput
                style={styles.fieldInput}
                value={value.estimatedTollCost}
                onChangeText={(t) => onChange({ ...value, estimatedTollCost: t })}
                keyboardType="decimal-pad"
                placeholder="ex: 120"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Preview de estimativa */}
          {value.totalKm && value.fuelEfficiency && value.fuelPricePerLiter && (
            <View style={styles.estimateCard}>
              <Text style={styles.estimateTitle}>Estimativa de custos</Text>
              {(() => {
                const km = parseFloat(value.totalKm || '0');
                const eff = parseFloat(value.fuelEfficiency || '0');
                const price = parseFloat(value.fuelPricePerLiter || '0');
                const toll = parseFloat(value.estimatedTollCost || '0');
                const fuelCost = eff > 0 ? (km / eff) * price : 0;
                const total = fuelCost + toll;
                const hours = Math.floor(km / 80);
                const mins = Math.round(((km / 80) - hours) * 60);
                return (
                  <View style={styles.estimateGrid}>
                    <View style={styles.estimateItem}>
                      <Text style={styles.estimateValue}>⛽ R$ {fuelCost.toFixed(0)}</Text>
                      <Text style={styles.estimateLabel}>combustível</Text>
                    </View>
                    {toll > 0 && (
                      <View style={styles.estimateItem}>
                        <Text style={styles.estimateValue}>🛣️ R$ {toll.toFixed(0)}</Text>
                        <Text style={styles.estimateLabel}>pedágios</Text>
                      </View>
                    )}
                    <View style={styles.estimateItem}>
                      <Text style={styles.estimateValue}>💰 R$ {total.toFixed(0)}</Text>
                      <Text style={styles.estimateLabel}>total estimado</Text>
                    </View>
                    <View style={styles.estimateItem}>
                      <Text style={styles.estimateValue}>⏱️ ~{hours}h{mins > 0 ? mins + 'min' : ''}</Text>
                      <Text style={styles.estimateLabel}>tempo de viagem</Text>
                    </View>
                  </View>
                );
              })()}
              <Text style={styles.estimateNote}>
                * Estimativa baseada em média de 80 km/h. Pedágios podem variar por rota.
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
    title: {
      color: colors.text, fontSize: fontSize.xxl,
      fontWeight: '800', letterSpacing: -0.5,
    },
    subtitle: {
      color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20,
    },
    grid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    },
    modeCard: {
      width: '47%', backgroundColor: colors.surface,
      borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border,
      padding: spacing.md, gap: 4, position: 'relative',
    },
    modeCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySofter,
    },
    modeIcon: { fontSize: 28 },
    modeLabel: {
      color: colors.text, fontSize: fontSize.md, fontWeight: '700',
    },
    modeLabelSelected: { color: colors.primary },
    modeDesc: {
      color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16,
    },
    primaryBadge: {
      position: 'absolute', top: spacing.sm, right: 28,
      backgroundColor: colors.primary, borderRadius: radius.pill,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    primaryBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
    checkMark: {
      position: 'absolute', top: spacing.sm, right: spacing.sm,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    checkMarkText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    hint: {
      color: colors.textMuted, fontSize: fontSize.xs,
      textAlign: 'center', fontStyle: 'italic',
    },
    carSection: {
      backgroundColor: colors.surface, borderRadius: radius.xl,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.lg, gap: spacing.md,
    },
    carTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    carSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 18 },
    carFields: { gap: spacing.md },
    carField: { gap: 6 },
    fieldLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
    fieldInput: {
      backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
      color: colors.text, fontSize: fontSize.md,
      paddingHorizontal: spacing.md, paddingVertical: 12,
    },
    estimateCard: {
      backgroundColor: colors.primarySofter, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.primarySoft,
      padding: spacing.md, gap: spacing.sm,
    },
    estimateTitle: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },
    estimateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    estimateItem: { minWidth: '45%', gap: 2 },
    estimateValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    estimateLabel: { color: colors.textMuted, fontSize: fontSize.xs },
    estimateNote: {
      color: colors.textMuted, fontSize: 10, fontStyle: 'italic', lineHeight: 14,
    },
  }), [themeVersion]);
}
