/**
 * PlaceSafetyModal — exibe alertas de segurança de um lugar e
 * permite ao usuário reportar novos alertas ou confirmar existentes.
 */
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronDown, ChevronUp, X } from '@/components/Icon';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import {
  usePlaceSafety,
  SAFETY_ALERT_LABELS,
  SEVERITY_LABELS,
  type SafetyAlertType,
  type PlaceSafetyAlert,
} from '@/hooks/usePlaceSafety';

type Props = {
  visible: boolean;
  placeId: string;
  placeName: string;
  currentUserId: string | null;
  onClose: () => void;
};

export function PlaceSafetyModal({ visible, placeId, placeName, currentUserId, onClose }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { alerts, summary, loading, reportAlert, toggleConfirmation } = usePlaceSafety(placeId, currentUserId);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedType, setSelectedType] = useState<SafetyAlertType | null>(null);
  const [severity, setSeverity] = useState<1|2|3>(2);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleReport() {
    if (!selectedType) { toast.error('Selecione o tipo de alerta.'); return; }
    if (!currentUserId) { toast.error('Você precisa estar logado.'); return; }
    setSaving(true);
    const ok = await reportAlert({
      place_name: placeName,
      alert_type: selectedType,
      severity,
      description: description.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      toast.success('Alerta reportado. Obrigado por ajudar outros viajantes!');
      setShowForm(false); setSelectedType(null); setDescription('');
    } else {
      toast.error('Erro ao reportar. Tente novamente.');
    }
  }

  const severityColor = (s: number) => SEVERITY_LABELS[s as 1|2|3]?.color ?? colors.textMuted;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="#f97316" />
            <Text style={styles.headerTitle}>Segurança</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.placeName} numberOfLines={2}>{placeName}</Text>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Resumo */}
          {summary && summary.total_alerts > 0 && (
            <View style={[styles.summaryBox, { borderColor: severityColor(summary.max_severity) + '40' }]}>
              <View style={[styles.severityBadge, { backgroundColor: severityColor(summary.max_severity) + '20' }]}>
                <Text style={[styles.severityText, { color: severityColor(summary.max_severity) }]}>
                  {SEVERITY_LABELS[summary.max_severity as 1|2|3]?.label ?? 'Alerta'}
                </Text>
              </View>
              <Text style={styles.summaryDesc}>
                {summary.total_alerts} alerta{summary.total_alerts > 1 ? 's' : ''} reportado{summary.total_alerts > 1 ? 's' : ''} por viajantes
              </Text>
            </View>
          )}

          {/* Lista de alertas */}
          {alerts.length === 0 && !loading ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>Nenhum alerta reportado</Text>
              <Text style={styles.emptyDesc}>Se você conhece algum risco neste lugar, ajude outros viajantes reportando abaixo.</Text>
            </View>
          ) : (
            alerts.map((alert) => <AlertCard
              key={alert.id}
              alert={alert}
              currentUserId={currentUserId}
              onConfirm={() => toggleConfirmation(alert.id, !!alert.my_confirmation)}
            />)
          )}

          {/* Botão reportar */}
          {!showForm ? (
            <Button
              title="Reportar um alerta"
              variant="secondary"
              onPress={() => setShowForm(true)}
              leftIcon={<AlertTriangle size={16} color={colors.text} />}
            />
          ) : (
            <View style={styles.formBox}>
              <Text style={styles.formTitle}>Reportar alerta</Text>

              {/* Tipo de alerta */}
              <Text style={styles.fieldLabel}>Tipo de alerta</Text>
              <View style={styles.typeGrid}>
                {(Object.keys(SAFETY_ALERT_LABELS) as SafetyAlertType[]).map((type) => {
                  const info = SAFETY_ALERT_LABELS[type];
                  const selected = selectedType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                      onPress={() => setSelectedType(type)}
                    >
                      <Text style={styles.typeChipIcon}>{info.icon}</Text>
                      <Text style={[styles.typeChipLabel, selected && styles.typeChipLabelSelected]}>
                        {info.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Severidade */}
              <Text style={styles.fieldLabel}>Nível de risco</Text>
              <View style={styles.severityRow}>
                {([1, 2, 3] as const).map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.severityBtn, severity === s && { borderColor: severityColor(s), backgroundColor: severityColor(s) + '15' }]}
                    onPress={() => setSeverity(s)}
                  >
                    <Text style={[styles.severityBtnText, severity === s && { color: severityColor(s), fontWeight: '700' }]}>
                      {SEVERITY_LABELS[s].label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Descrição */}
              <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
              <TextInput
                style={styles.textarea}
                value={description}
                onChangeText={setDescription}
                placeholder="Detalhes que podem ajudar outros viajantes..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={300}
                textAlignVertical="top"
              />

              <View style={styles.formActions}>
                <Button title="Cancelar" variant="ghost" onPress={() => { setShowForm(false); setSelectedType(null); }} />
                <Button title="Reportar" onPress={handleReport} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AlertCard({ alert, currentUserId, onConfirm }: {
  alert: PlaceSafetyAlert;
  currentUserId: string | null;
  onConfirm: () => void;
}) {
  const styles = useStyles();
  const info = SAFETY_ALERT_LABELS[alert.alert_type];
  const sev = SEVERITY_LABELS[alert.severity];

  return (
    <View style={[styles.alertCard, { borderLeftColor: sev.color }]}>
      <View style={styles.alertHeader}>
        <Text style={styles.alertIcon}>{info.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertType}>{info.label}</Text>
          <View style={[styles.alertSevBadge, { backgroundColor: sev.color + '20' }]}>
            <Text style={[styles.alertSevText, { color: sev.color }]}>{sev.label}</Text>
          </View>
        </View>
        {currentUserId && (
          <Pressable
            style={[styles.confirmBtn, alert.my_confirmation && styles.confirmBtnActive]}
            onPress={onConfirm}
          >
            <Text style={[styles.confirmText, alert.my_confirmation && styles.confirmTextActive]}>
              {alert.my_confirmation ? '✓ Confirmei' : 'Confirmar'}
            </Text>
          </Pressable>
        )}
      </View>
      {alert.description ? (
        <Text style={styles.alertDesc}>{alert.description}</Text>
      ) : null}
      <Text style={styles.alertMeta}>
        {alert.confirmed_count} confirmação{alert.confirmed_count !== 1 ? 'ões' : ''} · {
          new Date(alert.created_at).toLocaleDateString('pt-BR')
        }
      </Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs,
    },
    headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    placeName: {
      fontSize: fontSize.sm, color: colors.textMuted,
      paddingHorizontal: spacing.lg, marginBottom: spacing.md,
    },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md },
    summaryBox: {
      backgroundColor: colors.surface, borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, gap: spacing.xs,
    },
    severityBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
    severityText: { fontSize: fontSize.xs, fontWeight: '700' },
    summaryDesc: { fontSize: fontSize.sm, color: colors.textMuted },
    emptyBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    emptyIcon: { fontSize: 36 },
    emptyTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
    emptyDesc: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    alertCard: {
      backgroundColor: colors.surface, borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, borderColor: colors.border,
      borderLeftWidth: 3, gap: spacing.xs,
    },
    alertHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    alertIcon: { fontSize: 20, marginTop: 1 },
    alertType: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 3 },
    alertSevBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
    alertSevText: { fontSize: 10, fontWeight: '700' },
    alertDesc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },
    alertMeta: { fontSize: 11, color: colors.textMuted },
    confirmBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    confirmBtnActive: { borderColor: '#22c55e', backgroundColor: '#22c55e20' },
    confirmText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    confirmTextActive: { color: '#22c55e', fontWeight: '700' },
    formBox: {
      backgroundColor: colors.surface, borderRadius: radius.lg,
      padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md,
    },
    formTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
    fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    typeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
    },
    typeChipSelected: { borderColor: '#f97316', backgroundColor: '#f9731615' },
    typeChipIcon: { fontSize: 13 },
    typeChipLabel: { fontSize: 12, color: colors.textMuted },
    typeChipLabelSelected: { color: '#f97316', fontWeight: '600' },
    severityRow: { flexDirection: 'row', gap: spacing.sm },
    severityBtn: {
      flex: 1, paddingVertical: 9, borderRadius: radius.sm,
      borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    severityBtnText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
    textarea: {
      backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.md, padding: spacing.md, minHeight: 80,
      fontSize: fontSize.sm, color: colors.text,
    },
    formActions: { flexDirection: 'row', gap: spacing.sm },
  }), [themeVersion]);
}
