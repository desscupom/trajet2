/**
 * savings-plan.tsx — Plano de Poupança para a Viagem
 *
 * Mostra:
 * - Total estimado vs. valor já guardado
 * - Percentual de progresso
 * - Quanto guardar por mês e quando vai chegar
 * - Lembretes mensais configuráveis
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBR } from '@/lib/dates';
import { MoneyInput } from '@/components/MoneyInput';
import { Pressable } from 'react-native';
import { colors, fontSize, radius, shadow, spacing } from '@/lib/theme';

// ─── Helpers ──────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthsUntil(target: number, saved: number, monthly: number): number | null {
  if (monthly <= 0) return null;
  const remaining = Math.max(0, target - saved);
  return Math.ceil(remaining / monthly);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── Component ────────────────────────────────────────────────
export default function SavingsPlanScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { id: tripId } = useLocalSearchParams<{ id: string }>();

  const [trip, setTrip] = useState<any>(null);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [currency, setCurrency] = useState('BRL');
  const [saved, setSaved] = useState('');
  const [monthly, setMonthly] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDay, setReminderDay] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contributions, setContributions] = useState<{ id: string; amount: number; date: string; note: string | null }[]>([]);
  const [newContrib, setNewContrib] = useState('');
  const [newContribNote, setNewContribNote] = useState('');

  // Soma das contribuições registradas
  const totalContributions = contributions.reduce((s, c) => s + c.amount, 0);

  const savedNum = parseFloat(saved.replace(',', '.')) || 0;
  const effectiveSaved = savedNum + totalContributions;
  const monthlyNum = parseFloat(monthly.replace(',', '.')) || 0;
  const totalTarget = totalExpenses;
  const remaining = Math.max(0, totalTarget - savedNum);
  const progressPct = totalTarget > 0 ? Math.min(100, (savedNum / totalTarget) * 100) : 0;
  const months = monthsUntil(totalTarget, savedNum, monthlyNum);
  const targetDate = months != null ? addMonths(new Date(), months) : null;

  // Carrega dados da viagem e despesas
  useEffect(() => {
    if (!tripId) return;
    async function load() {
      setLoading(true);
      const [tripRes, expRes] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).single(),
        supabase.from('expenses').select('amount_in_base').eq('trip_id', tripId),
      ]);
      if (tripRes.data) {
        setTrip(tripRes.data);
        setCurrency(tripRes.data.base_currency ?? 'BRL');
      }
      const total = (expRes.data ?? []).reduce((s: number, e: any) => s + (e.amount_in_base ?? 0), 0);
      setTotalExpenses(total);

      // Carrega contribuições de poupança
      const { data: contribs } = await (supabase as any)
        .from('savings_contributions')
        .select('id, amount, date, note')
        .eq('trip_id', tripId)
        .order('date', { ascending: false });
      setContributions(contribs ?? []);
      setLoading(false);
    }
    load();
  }, [tripId]);

  async function handleAddContribution() {
    const amt = parseFloat(newContrib.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) {
      toast.error('Valor inválido.');
      return;
    }
    const { data, error } = await (supabase as any).from('savings_contributions').insert({
      trip_id: tripId,
      profile_id: user?.id,
      amount: amt,
      date: new Date().toISOString().slice(0, 10),
      note: newContribNote.trim() || null,
    }).select('id, amount, date, note').single();

    if (!error && data) {
      setContributions(prev => [data, ...prev]);
      setNewContrib('');
      setNewContribNote('');
      toast.success(`${currency} ${fmt(amt)} registrado!`);
    } else {
      toast.error('Não foi possível registrar.');
    }
  }

  async function handleRemoveContribution(id: string) {
    await (supabase as any).from('savings_contributions').delete().eq('id', id);
    setContributions(prev => prev.filter(c => c.id !== id));
  }

  async function handleSaveReminder() {
    if (!reminderEnabled) {
      // Cancela notificações existentes deste plano
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const planNotifs = scheduled.filter((n) => n.content.data?.tripId === tripId && n.content.data?.type === 'savings');
      await Promise.all(planNotifs.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
      toast.success('Lembrete desativado.');
      return;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Ative as notificações nas configurações para receber lembretes.');
      return;
    }

    const day = parseInt(reminderDay, 10);
    if (isNaN(day) || day < 1 || day > 28) {
      toast.error('Dia inválido — escolha entre 1 e 28.');
      return;
    }

    setSaving(true);
    try {
      // Cancela antigas
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const planNotifs = scheduled.filter((n) => n.content.data?.tripId === tripId && n.content.data?.type === 'savings');
      await Promise.all(planNotifs.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));

      // Agenda mensal
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 Hora de guardar para a viagem!',
          body: `Guarde ${currency} ${fmt(monthlyNum)} hoje para chegar em ${trip?.title ?? 'sua viagem'}.`,
          sound: true,
          data: { tripId, type: 'savings' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          day,
          hour: 9,
          minute: 0,
          repeats: true,
        },
      });

      toast.success(`Lembrete configurado para todo dia ${day} do mês.`);
    } catch (err) {
      toast.error('Erro ao configurar lembrete.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Plano de poupança' }} />
        <View style={styles.center}>
          <Text style={styles.muted}>Carregando…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '💰 Plano de poupança' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Viagem */}
        <View style={styles.tripCard}>
          <Text style={styles.tripName}>{trip?.title}</Text>
          {trip?.start_date && (
            <Text style={styles.tripDate}>
              {formatDateBR(trip.start_date)}
              {trip.end_date ? ` → ${formatDateBR(trip.end_date)}` : ''}
            </Text>
          )}
        </View>

        {/* Meta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meta da viagem</Text>
          {totalTarget > 0 ? (
            <View style={styles.targetBox}>
              <Text style={styles.targetValue}>{currency} {fmt(totalTarget)}</Text>
              <Text style={styles.targetHint}>baseado nas despesas registradas</Text>
            </View>
          ) : (
            <View style={styles.emptyTarget}>
              <Text style={styles.muted}>Nenhuma despesa registrada ainda.</Text>
              <Text style={styles.muted}>Adicione despesas na aba Despesas para ver a meta.</Text>
            </View>
          )}
        </View>

        {/* Quanto já guardou */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quanto já guardou</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyLabel}>{currency}</Text>
            <TextInput
              style={styles.moneyInput}
              value={saved}
              onChangeText={setSaved}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Progresso */}
        {totalTarget > 0 && (
          <View style={styles.section}>
            <View style={styles.progressHeader}>
              <Text style={styles.sectionTitle}>Progresso</Text>
              <Text style={[styles.progressPct, progressPct >= 100 && styles.progressDone]}>
                {progressPct.toFixed(0)}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.muted}>{currency} {fmt(effectiveSaved)} guardado</Text>
              <Text style={styles.muted}>{currency} {fmt(remaining)} faltando</Text>
            </View>
            {progressPct >= 100 && (
              <View style={styles.doneBox}>
                <Text style={styles.doneText}>🎉 Você já tem o suficiente para esta viagem!</Text>
              </View>
            )}
          </View>
        )}

        {/* Contribuições registradas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Depósitos registrados</Text>
          {totalContributions > 0 && (
            <View style={styles.contribTotal}>
              <Text style={styles.contribTotalLabel}>Total depositado</Text>
              <Text style={styles.contribTotalValue}>{currency} {fmt(totalContributions)}</Text>
            </View>
          )}
          {/* Mini gráfico de barras */}
          {contributions.length > 1 && (
            <View style={styles.chartWrap}>
              {contributions.slice(0, 6).reverse().map((contrib, i) => {
                const maxAmt = Math.max(...contributions.map(c => c.amount));
                const barH = maxAmt > 0 ? Math.max(8, (contrib.amount / maxAmt) * 60) : 8;
                return (
                  <View key={contrib.id} style={styles.chartBar}>
                    <Text style={styles.chartBarValue}>{fmt(contrib.amount)}</Text>
                    <View style={[styles.chartBarFill, { height: barH }]} />
                    <Text style={styles.chartBarDate}>{contrib.date.slice(5)}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {/* Adicionar novo depósito */}
          <View style={styles.contribInputRow}>
            <TextInput
              style={styles.contribInput}
              value={newContrib}
              onChangeText={setNewContrib}
              placeholder="Valor"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.contribInput, { flex: 1 }]}
              value={newContribNote}
              onChangeText={setNewContribNote}
              placeholder="Nota (opcional)"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable onPress={handleAddContribution} style={styles.contribAddBtn}>
              <Text style={styles.contribAddBtnText}>+</Text>
            </Pressable>
          </View>
          {contributions.slice(0, 5).map((contrib) => (
            <View key={contrib.id} style={styles.contribRow}>
              <View style={styles.contribInfo}>
                <Text style={styles.contribAmount}>{currency} {fmt(contrib.amount)}</Text>
                {contrib.note && <Text style={styles.contribNote}>{contrib.note}</Text>}
                <Text style={styles.contribDate}>{formatDateBR(contrib.date)}</Text>
              </View>
              <Pressable onPress={() => handleRemoveContribution(contrib.id)} hitSlop={8}>
                <Text style={styles.contribRemove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Quanto guardar por mês */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quanto guardar por mês</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyLabel}>{currency}</Text>
            <TextInput
              style={styles.moneyInput}
              value={monthly}
              onChangeText={setMonthly}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          </View>
          {months != null && targetDate && months > 0 && (
            <View style={styles.projectionBox}>
              <Text style={styles.projectionMonths}>
                {months} {months === 1 ? 'mês' : 'meses'}
              </Text>
              <Text style={styles.projectionDate}>
                Chegará em {targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </Text>
            </View>
          )}
          {months === 0 && totalTarget > 0 && (
            <View style={styles.projectionBox}>
              <Text style={styles.projectionMonths}>Pronto! ✅</Text>
              <Text style={styles.projectionDate}>Você já tem o valor necessário</Text>
            </View>
          )}
        </View>

        {/* Lembrete mensal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lembrete mensal</Text>
          <View style={styles.reminderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderLabel}>Lembrar de guardar todo mês</Text>
              <Text style={styles.muted}>Receba uma notificação no dia escolhido</Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={setReminderEnabled}
              trackColor={{ true: colors.primary }}
            />
          </View>

          {reminderEnabled && (
            <View style={styles.reminderConfig}>
              <Text style={styles.reminderDayLabel}>Dia do mês para lembrar:</Text>
              <View style={styles.inputRow}>
                <Text style={styles.muted}>Dia</Text>
                <TextInput
                  style={[styles.moneyInput, { width: 60 }]}
                  value={reminderDay}
                  onChangeText={setReminderDay}
                  keyboardType="numeric"
                  maxLength={2}
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.muted}>de cada mês</Text>
              </View>
              <Button
                title="Salvar lembrete"
                onPress={handleSaveReminder}
                loading={saving}
                style={{ marginTop: spacing.md }}
              />
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    tripCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.sm,
    },
    tripName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    tripDate: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    targetBox: { alignItems: 'center', paddingVertical: spacing.sm },
    targetValue: { fontSize: 36, fontWeight: '800', letterSpacing: -1.5, color: colors.primary },
    targetHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
    emptyTarget: { gap: 4, alignItems: 'center', paddingVertical: spacing.sm },
    inputRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.bg, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    currencyLabel: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '600' },
    moneyInput: { flex: 1, color: colors.text, fontSize: fontSize.lg, fontWeight: '600', padding: 0 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressPct: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
    progressDone: { color: '#10b981' },
    progressTrack: {
      height: 10, backgroundColor: colors.surfaceAlt,
      borderRadius: 5, overflow: 'hidden',
    },
    progressFill: {
      height: 10,
      backgroundColor: colors.primary,
      borderRadius: 5,
    },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    contribTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    contribTotalLabel: { color: colors.textMuted, fontSize: fontSize.sm },
    contribTotalValue: { color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' },
    chartWrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    chartBar: { flex: 1, alignItems: 'center', gap: 4 },
    chartBarValue: { color: colors.textMuted, fontSize: 9, textAlign: 'center' },
    chartBarFill: { width: '70%', backgroundColor: colors.primary, borderRadius: 3, minHeight: 8 },
    chartBarDate: { color: colors.textMuted, fontSize: 9, textAlign: 'center' },
    contribInputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
      alignItems: 'center',
    },
    contribInput: {
      flex: 0.5,
      height: 40,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      color: colors.text,
      fontSize: fontSize.sm,
      backgroundColor: colors.surface,
    },
    contribAddBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contribAddBtnText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 26 },
    contribRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    contribInfo: { flex: 1, gap: 2 },
    contribAmount: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    contribNote: { color: colors.textMuted, fontSize: fontSize.sm },
    contribDate: { color: colors.textMuted, fontSize: fontSize.xs },
    contribRemove: { color: colors.textMuted, fontSize: fontSize.md, padding: spacing.xs },
    doneBox: {
      backgroundColor: 'rgba(16,185,129,.1)', borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, borderColor: 'rgba(16,185,129,.25)',
    },
    doneText: { color: '#10b981', fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center' },
    projectionBox: {
      backgroundColor: colors.primarySofter, borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, borderColor: colors.primarySoft,
      alignItems: 'center',
    },
    projectionMonths: { fontSize: 28, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
    projectionDate: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
    reminderRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    },
    reminderLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 2 },
    reminderConfig: { gap: spacing.sm },
    reminderDayLabel: { fontSize: fontSize.sm, color: colors.textMuted },
    muted: { fontSize: fontSize.sm, color: colors.textMuted },
  }), [themeVersion]);
}
