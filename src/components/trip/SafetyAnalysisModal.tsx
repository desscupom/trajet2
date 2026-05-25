/**
 * SafetyAnalysisModal — Analisa a segurança de um local com IA
 * Combina dados reportados por usuários + análise da IA
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from '@/components/Icon';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { callOpenAI } from '@/lib/openaiClient';
import { usePlaceSafety, SAFETY_ALERT_LABELS, SEVERITY_LABELS } from '@/hooks/usePlaceSafety';
import { appendSafetyRules } from '@/lib/contentSafety';

type Props = {
  visible: boolean;
  placeId: string;
  placeName: string;
  placeAddress?: string | null;
  currentUserId: string | null;
  onClose: () => void;
};

export function SafetyAnalysisModal({
  visible, placeId, placeName, placeAddress, currentUserId, onClose,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { alerts, summary, loading: alertsLoading } = usePlaceSafety(placeId, currentUserId);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function analyzeWithAI() {
    setAiLoading(true);
    try {
      const alertContext = alerts.length > 0
        ? `Alertas reportados por viajantes: ${alerts.map((a) => `${SAFETY_ALERT_LABELS[a.alert_type]?.label} (${a.confirmed_count} confirmação(ões))`).join(', ')}.`
        : 'Nenhum alerta reportado por viajantes neste local.';

      const prompt = appendSafetyRules(`Você é um especialista em segurança para viajantes. Analise a segurança do local abaixo de forma breve, objetiva e sem alarmismo.

Local: ${placeName}
${placeAddress ? `Endereço: ${placeAddress}` : ''}
${alertContext}

Forneça uma análise em 3-4 linhas cobrindo:
1. Segurança geral do local/região
2. Dicas práticas e específicas
3. Grupos que devem ter mais atenção (se aplicável)
4. Horários seguros vs. evitar (se relevante)

Seja direto e factual. Não exagere riscos nem os minimize.`);

      const result = await callOpenAI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      });

      setAiAnalysis(result);
    } catch {
      toast.error('Não foi possível analisar agora. Tente novamente.');
    } finally {
      setAiLoading(false);
    }
  }

  const severityColor = (s: number) => SEVERITY_LABELS[s as 1|2|3]?.color ?? colors.textMuted;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🔍 Segurança do local</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{placeName}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Alertas da comunidade */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alertas da comunidade</Text>
            {alertsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : alerts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>Nenhum alerta reportado para este local.</Text>
              </View>
            ) : (
              <>
                {summary && (
                  <View style={[styles.summaryBadge, { borderColor: severityColor(summary.max_severity) + '40' }]}>
                    <View style={[styles.severityDot, { backgroundColor: severityColor(summary.max_severity) }]} />
                    <Text style={[styles.summaryText, { color: severityColor(summary.max_severity) }]}>
                      {SEVERITY_LABELS[summary.max_severity as 1|2|3]?.label} — {summary.total_alerts} alerta{summary.total_alerts > 1 ? 's' : ''} reportado{summary.total_alerts > 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
                {alerts.slice(0, 4).map((alert) => {
                  const info = SAFETY_ALERT_LABELS[alert.alert_type];
                  const sev = SEVERITY_LABELS[alert.severity as 1|2|3];
                  return (
                    <View key={alert.id} style={[styles.alertRow, { borderLeftColor: sev.color }]}>
                      <Text style={styles.alertIcon}>{info.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alertLabel}>{info.label}</Text>
                        {alert.description && (
                          <Text style={styles.alertDesc}>{alert.description}</Text>
                        )}
                        <Text style={styles.alertMeta}>{alert.confirmed_count} confirmação{alert.confirmed_count !== 1 ? 'ões' : ''}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* Análise da IA */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✨ Análise com IA</Text>
            {aiAnalysis ? (
              <View style={styles.aiBox}>
                <Text style={styles.aiText}>{aiAnalysis}</Text>
              </View>
            ) : (
              <View style={styles.aiPromptBox}>
                <Text style={styles.aiPromptText}>
                  A IA analisa a segurança deste local com base em dados públicos e alertas da comunidade.
                </Text>
                <Button
                  title={aiLoading ? 'Analisando…' : '🔍 Analisar segurança'}
                  onPress={analyzeWithAI}
                  loading={aiLoading}
                />
              </View>
            )}
          </View>

          <Text style={styles.disclaimer}>
            As informações acima são baseadas em relatos de viajantes e análise de IA. Sempre verifique fontes oficiais antes de viajar.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'flex-start',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderColor: colors.border,
    },
    headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
    headerSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
    section: {
      backgroundColor: colors.surface, borderRadius: radius.lg,
      padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
      gap: spacing.sm,
    },
    sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginBottom: 4 },
    emptyBox: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.xs },
    emptyIcon: { fontSize: 28 },
    emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
    summaryBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.bg, borderRadius: radius.md,
      padding: spacing.sm, borderWidth: 1,
    },
    severityDot: { width: 8, height: 8, borderRadius: 4 },
    summaryText: { fontSize: fontSize.sm, fontWeight: '600' },
    alertRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      backgroundColor: colors.bg, borderRadius: radius.md,
      padding: spacing.sm, borderWidth: 1, borderColor: colors.border,
      borderLeftWidth: 3,
    },
    alertIcon: { fontSize: 16, marginTop: 1 },
    alertLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
    alertDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
    alertMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    aiBox: {
      backgroundColor: colors.bg, borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, borderColor: colors.primarySoft,
    },
    aiText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
    aiPromptBox: { gap: spacing.md },
    aiPromptText: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
    disclaimer: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  }), [themeVersion]);
}
