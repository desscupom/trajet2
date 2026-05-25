import {useEffect, useState, useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { FadeInView } from '@/components/FadeInView';
import { Bell, BellOff } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  useNotificationPreferences,
  type NotificationPreferences,
} from '@/hooks/useNotificationPreferences';
import { requestNotificationPermission } from '@/lib/notifications';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const TASK_OFFSET_OPTIONS = [
  { value: 60, label: '1 hora antes' },
  { value: 180, label: '3 horas antes' },
  { value: 1440, label: '1 dia antes' },
  { value: 2880, label: '2 dias antes' },
];

const TRIP_OFFSET_OPTIONS = [
  { value: 1, label: '1 dia antes' },
  { value: 3, label: '3 dias antes' },
  { value: 7, label: '1 semana antes' },
];

const LODGING_OFFSET_OPTIONS = [
  { value: 30, label: '30 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 240, label: '4 horas antes' },
];

export default function NotificationsScreen() {
  const styles = useStyles();
  const toast = useToast();
  const { prefs, loading, update } = useNotificationPreferences();
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  // Confere status da permissão ao abrir
  useEffect(() => {
    if (Platform.OS === 'web') {
      setPermGranted(false);
      return;
    }
    let mounted = true;
    (async () => {
      // Lazy import pra não estourar bundle web
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      if (mounted) setPermGranted(status === 'granted');
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleRequestPermission() {
    const granted = await requestNotificationPermission();
    setPermGranted(granted);
    if (!granted) {
      Alert.alert(
        'Permissão negada',
        'Pra receber lembretes, você precisa ativar notificações nas configurações do sistema.'
      );
    } else {
      toast.success('Notificações ativadas no sistema.');
    }
  }

  async function toggle(key: keyof NotificationPreferences, value: boolean) {
    const { error } = await update({ [key]: value });
    if (error) toast.error(error);
  }

  async function setOffset(
    key:
      | 'task_due_offset_minutes'
      | 'trip_starting_offset_days'
      | 'lodging_checkin_offset_minutes',
    value: number
  ) {
    const { error } = await update({ [key]: value });
    if (error) toast.error(error);
  }

  if (loading || !prefs) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <Skeleton height={120} borderRadius={radius.lg} />
          <View style={{ height: spacing.md }} />
          <Skeleton height={200} borderRadius={radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  const isWeb = Platform.OS === 'web';
  const masterOff = !prefs.notifications_enabled;
  const needsPermission = !isWeb && permGranted === false;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* MASTER TOGGLE */}
        <FadeInView>
          <View style={styles.masterCard}>
            <View style={styles.masterIconWrap}>
              {masterOff ? (
                <BellOff size={28} color={colors.textMuted} />
              ) : (
                <Bell size={28} color={colors.primary} />
              )}
            </View>
            <View style={styles.masterContent}>
              <Text style={styles.masterTitle}>
                {masterOff ? 'Notificações desligadas' : 'Notificações ligadas'}
              </Text>
              <Text style={styles.masterHint}>
                {masterOff
                  ? 'Você não vai receber nenhum aviso até reativar.'
                  : 'Receba lembretes e atualizações da sua viagem.'}
              </Text>
            </View>
            <Switch
              value={prefs.notifications_enabled}
              onValueChange={(v) => toggle('notifications_enabled', v)}
              trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
              thumbColor={colors.text}
              ios_backgroundColor={colors.surfaceAlt}
            />
          </View>
        </FadeInView>

        {/* AVISO DE PERMISSÃO */}
        {needsPermission && !masterOff && (
          <FadeInView delay={60}>
            <View style={styles.permCard}>
              <View style={styles.permTextWrap}>
                <Text style={styles.permTitle}>Permita no celular</Text>
                <Text style={styles.permHint}>
                  Pra receber lembretes, autorize notificações no sistema.
                </Text>
              </View>
              <Button
                title="Permitir"
                size="sm"
                onPress={handleRequestPermission}
              />
            </View>
          </FadeInView>
        )}

        {/* AVISO WEB */}
        {isWeb && !masterOff && (
          <FadeInView delay={60}>
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                Notificações funcionam só no app móvel. Suas preferências serão
                aplicadas quando você abrir o Trajet no celular.
              </Text>
            </View>
          </FadeInView>
        )}

        {/* LEMBRETES LOCAIS */}
        <FadeInView delay={120}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Lembretes no celular</Text>
            <Text style={styles.sectionHint}>
              Funcionam mesmo offline. Agendados pelo seu próprio aparelho.
            </Text>

            <View style={styles.toggleCard}>
              <ToggleRow
                title="Tarefa com data limite"
                subtitle="Avisa quando uma tarefa está chegando"
                value={prefs.task_due_reminder}
                onChange={(v) => toggle('task_due_reminder', v)}
                disabled={masterOff}
              />

              {prefs.task_due_reminder && !masterOff && (
                <View style={styles.subOptions}>
                  <Text style={styles.subOptionsLabel}>Quando avisar?</Text>
                  <View style={styles.chipRow}>
                    {TASK_OFFSET_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => setOffset('task_due_offset_minutes', opt.value)}
                        style={[
                          styles.chip,
                          prefs.task_due_offset_minutes === opt.value &&
                            styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            prefs.task_due_offset_minutes === opt.value &&
                              styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.toggleCard}>
              <ToggleRow
                title="Viagem se aproximando"
                subtitle="Lembrete antes de você embarcar"
                value={prefs.trip_starting_reminder}
                onChange={(v) => toggle('trip_starting_reminder', v)}
                disabled={masterOff}
              />

              {prefs.trip_starting_reminder && !masterOff && (
                <View style={styles.subOptions}>
                  <Text style={styles.subOptionsLabel}>Quando avisar?</Text>
                  <View style={styles.chipRow}>
                    {TRIP_OFFSET_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => setOffset('trip_starting_offset_days', opt.value)}
                        style={[
                          styles.chip,
                          prefs.trip_starting_offset_days === opt.value &&
                            styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            prefs.trip_starting_offset_days === opt.value &&
                              styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.toggleCard}>
              <ToggleRow
                title="Check-in de hospedagem"
                subtitle="Lembrete antes de chegar no hotel/Airbnb"
                value={prefs.lodging_checkin_reminder}
                onChange={(v) => toggle('lodging_checkin_reminder', v)}
                disabled={masterOff}
              />

              {prefs.lodging_checkin_reminder && !masterOff && (
                <View style={styles.subOptions}>
                  <Text style={styles.subOptionsLabel}>Quanto tempo antes?</Text>
                  <View style={styles.chipRow}>
                    {LODGING_OFFSET_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() =>
                          setOffset('lodging_checkin_offset_minutes', opt.value)
                        }
                        style={[
                          styles.chip,
                          prefs.lodging_checkin_offset_minutes === opt.value &&
                            styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            prefs.lodging_checkin_offset_minutes === opt.value &&
                              styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </FadeInView>

        {/* NOTIFICAÇÕES REMOTAS - ATIVAS via realtime in-app */}
        <FadeInView delay={180}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Atividade da viagem</Text>
            <Text style={styles.sectionHint}>
              Avisos quando outros membros fazem alterações. Funciona enquanto o
              app está aberto. Push remoto (com app fechado) chega em breve.
            </Text>

            <View style={styles.toggleCard}>
              <ToggleRow
                title="Edições no roteiro"
                subtitle="Quando alguém adiciona ou move um lugar"
                value={prefs.trip_edits}
                onChange={(v) => toggle('trip_edits', v)}
                disabled={masterOff}
              />
              <View style={styles.divider} />
              <ToggleRow
                title="Despesas adicionadas"
                subtitle="Quando alguém registra um gasto"
                value={prefs.expense_added}
                onChange={(v) => toggle('expense_added', v)}
                disabled={masterOff}
              />
              <View style={styles.divider} />
              <ToggleRow
                title="Novo membro na viagem"
                subtitle="Quando alguém aceita o convite"
                value={prefs.member_joined}
                onChange={(v) => toggle('member_joined', v)}
                disabled={masterOff}
              />
            </View>
          </View>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleTitle, disabled && styles.disabledText]}>
          {title}
        </Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value && !disabled}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.surfaceAlt}
      />
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
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  masterIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterContent: { flex: 1 },
  masterTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  masterHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  permTextWrap: { flex: 1 },
  permTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  permHint: {
    color: colors.text,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  remoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  soonText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  toggleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabledCard: {
    opacity: 0.7,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleText: { flex: 1 },
  toggleTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    marginBottom: 2,
  },
  toggleSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  disabledText: {
    color: colors.textMuted,
  },
  subOptions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  subOptionsLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
}), [themeVersion]);
}
