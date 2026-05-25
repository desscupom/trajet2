import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Avatar } from '@/components/Avatar';
import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { MoneyInput } from '@/components/MoneyInput';
import { ArrowRight, Check, CircleCheck, Clock, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/expenses';
import { supabase } from '@/lib/supabase';
import { sendPushToUser } from '@/lib/sendPush';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import {
  computeSettleUp,
  type Balance,
  type SettleTransfer,
} from '@/lib/settleUp';

type Props = {
  visible: boolean;
  balances: Balance[];
  baseCurrency: string;
  tripId: string;
  onClose: () => void;
  onSettled?: () => void;
};

type SettlementHistory = {
  id: string;
  payer_id: string;
  receiver_id: string;
  amount_in_base: number;
  note: string | null;
  paid_at: string;
  payer_name?: string;
  receiver_name?: string;
};

type Tab = 'owe' | 'history';

export function SettleUpModal({
  visible,
  balances,
  baseCurrency,
  tripId,
  onClose,
  onSettled,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('owe');
  const [history, setHistory] = useState<SettlementHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [payingTo, setPayingTo] = useState<SettleTransfer | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  const transfers = useMemo(() => computeSettleUp(balances), [balances]);
  const myTransfers = useMemo(
    () => transfers.filter((t) => t.fromId === user?.id),
    [transfers, user?.id]
  );
  const otherTransfers = useMemo(
    () => transfers.filter((t) => t.fromId !== user?.id),
    [transfers, user?.id]
  );

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await (supabase as any)
      .from('settlement_payments')
      .select(`
        id, payer_id, receiver_id, amount_in_base, note, paid_at,
        payer:profiles!payer_id(full_name),
        receiver:profiles!receiver_id(full_name)
      `)
      .eq('trip_id', tripId)
      .order('paid_at', { ascending: false })
      .limit(50);

    setHistory((data ?? []).map((d: any) => ({
      ...d,
      payer_name: d.payer?.full_name?.split(' ')[0] ?? 'Alguém',
      receiver_name: d.receiver?.full_name?.split(' ')[0] ?? 'Alguém',
    })));
    setLoadingHistory(false);
  }, [tripId]);

  useEffect(() => {
    if (visible && tab === 'history') loadHistory();
  }, [visible, tab, loadHistory]);

  async function handlePay(transfer: SettleTransfer) {
    if (!user?.id) return;
    setSaving(true);
    try {
      const finalAmount = payAmount > 0 ? payAmount : transfer.amount;
      const { error } = await (supabase as any).from('settlement_payments').insert({
        trip_id: tripId,
        payer_id: user.id,
        receiver_id: transfer.toId,
        amount: finalAmount,
        currency: baseCurrency,
        amount_in_base: finalAmount,
        note: payAmount > 0 && payAmount < transfer.amount
          ? `Pagamento parcial (total: ${formatCurrency(transfer.amount, baseCurrency)})`
          : null,
      });

      if (error) { toast.error(error.message); return; }

      toast.success(`✅ Pagamento de ${formatCurrency(finalAmount, baseCurrency)} registrado para ${transfer.toName}!`);
      setPayingTo(null);
      setPayAmount(0);

      // Notifica o recebedor
      try {
        const payerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Alguém';
        await sendPushToUser(transfer.toId, {
          title: '💸 Pagamento recebido!',
          body: `${payerName} te pagou ${formatCurrency(finalAmount, baseCurrency)}.`,
          data: { type: 'settlement', tripId },
        });
      } catch (_) {}

      onSettled?.();
      loadHistory();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    Alert.alert('Remover pagamento?', 'Isso vai desfazer o registro deste pagamento.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await (supabase as any).from('settlement_payments').delete().eq('id', paymentId);
          loadHistory();
          onSettled?.();
        },
      },
    ]);
  }

  const hasNothing = transfers.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerDragBar} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Acertar contas</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, tab === 'owe' && styles.tabActive]}
              onPress={() => setTab('owe')}
            >
              <Text style={[styles.tabText, tab === 'owe' && styles.tabTextActive]}>Quem deve</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === 'history' && styles.tabActive]}
              onPress={() => { setTab('history'); loadHistory(); }}
            >
              <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>Histórico</Text>
            </Pressable>
          </View>
        </View>

        {tab === 'owe' ? (
          <ScrollView contentContainerStyle={styles.content}>
            {hasNothing ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <CircleCheck size={40} color={colors.success} />
                </View>
                <Text style={styles.emptyTitle}>Tudo zerado!</Text>
                <Text style={styles.emptyText}>Ninguém deve nada. Viagem financeiramente equilibrada.</Text>
              </View>
            ) : (
              <>
                {/* Meus débitos — destaque */}
                {myTransfers.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💸 Você deve pagar</Text>
                    {myTransfers.map((t, i) => (
                      <View key={i}>
                        <View style={[styles.transferCard, styles.transferCardMine]}>
                          <View style={styles.transferParty}>
                            <Avatar name={t.fromName} size={40} />
                            <Text style={styles.transferName}>{t.fromName}</Text>
                          </View>
                          <View style={styles.transferMiddle}>
                            <ArrowRight size={20} color={colors.danger} />
                            <Text style={styles.transferAmountMine}>
                              {formatCurrency(t.amount, baseCurrency)}
                            </Text>
                          </View>
                          <View style={styles.transferParty}>
                            <Avatar name={t.toName} size={40} />
                            <Text style={styles.transferName}>{t.toName}</Text>
                          </View>
                        </View>

                        {/* Botão de pagar */}
                        {payingTo?.toId === t.toId ? (
                          <View style={styles.payPanel}>
                            <Text style={styles.payPanelTitle}>
                              Valor pago a {t.toName}
                            </Text>
                            <Text style={styles.payPanelHint}>
                              Total sugerido: {formatCurrency(t.amount, baseCurrency)}
                            </Text>
                            <MoneyInput
                              value={payAmount || t.amount}
                              onChange={setPayAmount}
                              currency={baseCurrency}
                            />
                            <View style={styles.payPanelActions}>
                              <Button
                                title="Cancelar"
                                variant="ghost"
                                onPress={() => { setPayingTo(null); setPayAmount(0); }}
                                style={{ flex: 1 }}
                              />
                              <Button
                                title={`Registrar pagamento`}
                                onPress={() => handlePay(t)}
                                loading={saving}
                                style={{ flex: 2 }}
                              />
                            </View>
                          </View>
                        ) : (
                          <AnimatedPress
                            onPress={() => { setPayingTo(t); setPayAmount(t.amount); }}
                            pressScale={0.97}
                            style={styles.payBtn}
                          >
                            <Check size={14} color="#fff" />
                            <Text style={styles.payBtnText}>Marcar como pago</Text>
                          </AnimatedPress>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Outros devem */}
                {otherTransfers.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🔄 Outros devem pagar</Text>
                    {otherTransfers.map((t, i) => (
                      <View key={i} style={styles.transferCard}>
                        <View style={styles.transferParty}>
                          <Avatar name={t.fromName} size={36} />
                          <Text style={styles.transferName}>{t.fromName}</Text>
                        </View>
                        <View style={styles.transferMiddle}>
                          <ArrowRight size={16} color={colors.primary} />
                          <Text style={styles.transferAmount}>
                            {formatCurrency(t.amount, baseCurrency)}
                          </Text>
                        </View>
                        <View style={styles.transferParty}>
                          <Avatar name={t.toName} size={36} />
                          <Text style={styles.transferName}>{t.toName}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Saldo detalhado */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Saldo por pessoa</Text>
                  <View style={styles.balanceList}>
                    {balances.map((b) => (
                      <View key={b.profileId} style={styles.balanceRow}>
                        <Avatar name={b.name} size={32} />
                        <Text style={styles.balanceName}>{b.name}</Text>
                        <Text style={[
                          styles.balanceValue,
                          b.net > 0.01 && { color: colors.success },
                          b.net < -0.01 && { color: colors.danger },
                        ]}>
                          {b.net > 0.01 ? '+' : ''}{formatCurrency(b.net, baseCurrency)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <Text style={styles.disclaimer}>
                  O Trajet não processa pagamentos. Combine entre vocês via Pix, transferência, etc.
                </Text>
              </>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {loadingHistory ? (
              <Text style={styles.loadingText}>Carregando...</Text>
            ) : history.length === 0 ? (
              <View style={styles.empty}>
                <Clock size={36} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Sem pagamentos</Text>
                <Text style={styles.emptyText}>Nenhum acerto de conta registrado ainda.</Text>
              </View>
            ) : (
              history.map((h) => (
                <View key={h.id} style={styles.historyCard}>
                  <View style={styles.historyMain}>
                    <Text style={styles.historyText}>
                      <Text style={styles.historyName}>{h.payer_name}</Text>
                      {' pagou '}
                      <Text style={{ color: colors.success, fontWeight: '700' }}>
                        {formatCurrency(h.amount_in_base, baseCurrency)}
                      </Text>
                      {' para '}
                      <Text style={styles.historyName}>{h.receiver_name}</Text>
                    </Text>
                    {h.note && <Text style={styles.historyNote}>{h.note}</Text>}
                    <Text style={styles.historyDate}>
                      {new Date(h.paid_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {h.payer_id === user?.id && (
                    <Pressable onPress={() => handleDeletePayment(h.id)} hitSlop={8}>
                      <X size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    headerDragBar: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center', marginTop: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    },
    title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800', letterSpacing: -0.3 },
    closeBtn: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    closeBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
    },
    tab: {
      flex: 1, paddingVertical: 10, alignItems: 'center',
    },
    tabActive: {
      borderBottomWidth: 2, borderBottomColor: colors.primary,
    },
    tabText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' },
    tabTextActive: { color: colors.primary, fontWeight: '700' },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
    section: { gap: spacing.sm },
    sectionTitle: {
      color: colors.textMuted, fontSize: fontSize.xs,
      fontWeight: '700', letterSpacing: 0.8, marginBottom: 2,
    },
    // Cards de transferência
    transferCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg, padding: spacing.md,
      borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
    },
    transferCardMine: {
      borderColor: colors.danger + '60',
      backgroundColor: colors.danger + '0a',
    },
    transferParty: { flex: 1, alignItems: 'center', gap: 4 },
    transferName: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600', textAlign: 'center' },
    transferMiddle: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    transferAmount: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '800' },
    transferAmountMine: { color: colors.danger, fontSize: fontSize.md, fontWeight: '800' },
    // Painel de pagamento
    payBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.primary,
      borderRadius: radius.md, padding: spacing.sm,
      justifyContent: 'center', marginTop: 4,
    },
    payBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
    payPanel: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg, padding: spacing.lg,
      borderWidth: 1, borderColor: colors.primary + '40',
      gap: spacing.sm, marginTop: 4,
    },
    payPanelTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    payPanelHint: { color: colors.textMuted, fontSize: fontSize.xs },
    payPanelActions: { flexDirection: 'row', gap: spacing.sm },
    // Saldo
    balanceList: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden',
    },
    balanceRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.md, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
      gap: spacing.sm,
    },
    balanceName: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
    balanceValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    // Histórico
    historyCard: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: radius.md, padding: spacing.md,
      borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
    },
    historyMain: { flex: 1, gap: 3 },
    historyText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
    historyName: { fontWeight: '700' },
    historyNote: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic' },
    historyDate: { color: colors.textMuted, fontSize: fontSize.xs },
    // Empty
    empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.successSoft,
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    },
    emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    emptyText: {
      color: colors.textMuted, fontSize: fontSize.md,
      textAlign: 'center', lineHeight: 22, maxWidth: 300,
    },
    loadingText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
    disclaimer: {
      color: colors.textMuted, fontSize: fontSize.xs,
      textAlign: 'center', lineHeight: 18,
    },
  }), [themeVersion]);
}
