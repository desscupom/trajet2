import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { AnimatedPress } from '@/components/AnimatedPress';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { BarChart2, Calculator, Download, Plus, Wallet, X } from '@/components/Icon';
import { CategoryDonut } from '@/components/CategoryDonut';
import { CurrencyConverter } from '@/components/CurrencyConverter';
import { ExpenseDashboard } from '@/components/trip/ExpenseDashboard';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useTripMembers } from '@/hooks/useTripMembers';
import { formatDateBR } from '@/lib/dates';
import { type CurrencyCode, formatCurrency } from '@/lib/expenses';
import { getIconByName } from '@/lib/expenseIcons';
import { getStaggerDelay } from '@/lib/stagger';
import { supabase, type Trip } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

import { AddExpenseModal } from './AddExpenseModal';
import { SettleUpModal } from './SettleUpModal';
import { useTheme } from '@/components/ThemeProvider';
import { ExpenseRow } from './expense/ExpenseRow';
import type { Expense, Share } from './expense/types';
export type { Expense, Share } from './expense/types';



type Balance = {
  profileId: string;
  name: string;
  net: number;
};

export function ExpensesTab({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const { user } = useAuth();
  const toast = useToast();
  const { members } = useTripMembers(trip.id);
  const { categories: tripCategories } = useExpenseCategories(trip.id);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [pendingInstallments, setPendingInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [converterOpen, setConverterOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  async function handleExportCSV() {
    if (expenses.length === 0) { toast.error('Nenhuma despesa para exportar.'); return; }

    // Monta CSV
    const header = ['Data', 'Descrição', 'Categoria', 'Moeda', 'Valor', 'Valor base', 'Pago por'].join(',');
    const rows = expenses.map((e) => {
      const payer = members.find((m) => m.profile_id === e.paid_by);
      const payerName = payer?.profile?.full_name ?? payer?.profile?.email ?? e.paid_by;
      const cat = e.category ?? 'outros';
      const date = (e.expense_date ?? '').split('T')[0];
      return [date, `"${e.description.replace(/"/g, '""')}"`, cat, e.currency, e.amount.toFixed(2), e.amount_in_base.toFixed(2), `"${payerName}"`].join(',');
    });
    const csv = [header, ...rows].join('\n');

    try {
      const uri = `${FileSystem.cacheDirectory}despesas_${trip.title.replace(/\s/g, '_')}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Exportar despesas' });
    } catch (err: any) {
      toast.error('Erro ao exportar CSV.');
    }
  }

  const fetchData = useCallback(async () => {
    const [expensesResult, sharesResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', trip.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('expense_shares')
        .select('*, expenses!inner(trip_id)')
        .eq('expenses.trip_id', trip.id),
    ]);

    if (expensesResult.error) console.error(expensesResult.error);
    if (sharesResult.error) console.error(sharesResult.error);

    setExpenses(expensesResult.data ?? []);
    setShares((sharesResult.data ?? []) as unknown as Share[]);

    // Carrega parcelas pendentes do usuário atual
    if (user?.id) {
      const { data: installments } = await (supabase as any)
        .from('expenses')
        .select('id, description, amount, currency, expense_date, installment_number, installments_total, paid_by, parent_expense_id, payment_type')
        .eq('trip_id', trip.id)
        .eq('payment_type', 'parcelado')
        .gt('installment_number', 1)
        .order('expense_date');
      setPendingInstallments(installments ?? []);
    }

    setLoading(false);
  }, [trip.id]);

  const refreshProps = usePullToRefresh(fetchData);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useRealtimeTable({
    table: 'expenses',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchData,
  });
  useRealtimeTable({
    table: 'expense_shares',
    onChange: fetchData,
  });

  const balances = useMemo<Balance[]>(() => {
    if (members.length === 0) return [];
    const map: Record<string, number> = {};
    for (const m of members) {
      map[m.profile_id] = 0;
    }
    for (const exp of expenses) {
      if (map[exp.paid_by] !== undefined) {
        map[exp.paid_by] += exp.amount_in_base;
      }
    }
    for (const sh of shares) {
      if (map[sh.member_id] !== undefined) {
        map[sh.member_id] -= sh.share_amount;
      }
    }
    return members.map((m) => ({
      profileId: m.profile_id,
      name: m.profile?.full_name?.split(' ')[0] || m.profile?.email || '?',
      net: map[m.profile_id] ?? 0,
    }));
  }, [members, expenses, shares]);

  const totalSpent = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount_in_base, 0),
    [expenses]
  );

  // Agrupa despesas por categoria pra alimentar o donut
  const categorySegments = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const exp of expenses) {
      const key = exp.category || 'other';
      totals[key] = (totals[key] || 0) + exp.amount_in_base;
    }

    // Cores por categoria — built-in tem cor fixa, custom pega cor de fallback
    const CATEGORY_COLORS: Record<string, string> = {
      lodging: '#14b8a6', // teal
      food: '#f59e0b', // amber
      transport: '#3b82f6', // blue
      activities: '#8b5cf6', // violet
      shopping: '#ec4899', // pink
      other: '#94a3b8', // slate
    };

    // Paleta de fallback pra customs (rotativa baseada em hash do slug)
    const CUSTOM_PALETTE = ['#f97316', '#06b6d4', '#10b981', '#a855f7', '#eab308'];
    function colorForCustom(slug: string): string {
      let hash = 0;
      for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
      return CUSTOM_PALETTE[Math.abs(hash) % CUSTOM_PALETTE.length];
    }

    return Object.entries(totals)
      .map(([key, value]) => {
        const cat = tripCategories.find((c) => c.value === key);
        return {
          key,
          label: cat?.label ?? key,
          value,
          color: CATEGORY_COLORS[key] ?? colorForCustom(key),
          Icon: getIconByName(cat?.iconName),
        };
      })
      .sort((a, b) => b.value - a.value); // maiores primeiro
  }, [expenses, tripCategories]);

  async function handleRemoveExpense(expense: Expense) {
    Alert.alert(
      'Remover despesa?',
      `"${expense.description}" e sua divisão serão apagadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('expenses')
              .delete()
              .eq('id', expense.id);
            if (error) toast.error(error.message);
            else toast.success('Despesa removida.');
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.list}>
        <Skeleton height={120} borderRadius={radius.lg} />
        <View style={{ height: spacing.md }} />
        <Skeleton height={60} borderRadius={radius.md} />
        <View style={{ height: spacing.sm }} />
        <Skeleton height={60} borderRadius={radius.md} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={expenses.filter((e) => (!filterCategory || e.category === filterCategory) && (!searchQuery || (e.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())))}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <FadeInView style={styles.header}>
            <View style={styles.summaryCard}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.gradientPremiumTop }]} />
              <View style={styles.summaryGlow} />

              {expenses.length === 0 ? (
                // Estado vazio: só o total grande
                <View style={styles.summaryEmpty}>
                  <Text style={styles.summaryLabel}>Total da viagem</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(totalSpent, trip.base_currency)}
                  </Text>
                  <Text style={styles.summaryHint}>Nenhuma despesa ainda</Text>
                </View>
              ) : (
                // Com despesas: donut + total + breakdown
                <CategoryDonut
                  segments={categorySegments}
                  centerSubtitle="Total"
                  centerTitle={formatCurrency(totalSpent, trip.base_currency)}
                  size={130}
                  strokeWidth={14}
                />
              )}
            </View>

            {balances.length > 1 && expenses.length > 0 && (() => {
              const myBalance = balances.find(b => b.profileId === user?.id);
              const iOwe = myBalance && myBalance.net < -0.01;
              const theyOweMe = myBalance && myBalance.net > 0.01;
              return (
                <View style={[
                  styles.myBalanceBanner,
                  iOwe && styles.myBalanceBannerDebt,
                  theyOweMe && styles.myBalanceBannerCredit,
                ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.myBalanceBannerLabel}>
                      {iOwe ? 'Você deve' : theyOweMe ? 'Te devem' : 'Você está quite'}
                    </Text>
                    {myBalance && Math.abs(myBalance.net) > 0.01 && (
                      <Text style={[styles.myBalanceBannerValue, iOwe && { color: colors.danger }, theyOweMe && { color: colors.success }]}>
                        {formatCurrency(Math.abs(myBalance.net), trip.base_currency)}
                      </Text>
                    )}
                    {/* Para quem deve / quem deve */}
                    {(iOwe || theyOweMe) && (() => {
                      // Pega o maior credor/devedor
                      const others = balances.filter(b => b.profileId !== user?.id);
                      if (iOwe) {
                        // Quem tem maior net positivo é quem eu devo
                        const creditor = others.reduce((a, b) => b.net > a.net ? b : a, others[0]);
                        if (creditor && creditor.net > 0.01) {
                          return <Text style={[styles.myBalanceBannerSub]}>para {creditor.name}</Text>;
                        }
                      } else {
                        // Quem tem maior net negativo é quem me deve
                        const debtor = others.reduce((a, b) => b.net < a.net ? b : a, others[0]);
                        if (debtor && debtor.net < -0.01) {
                          return <Text style={[styles.myBalanceBannerSub]}>de {debtor.name}</Text>;
                        }
                      }
                      return null;
                    })()}
                  </View>
                  {iOwe && (
                    <View style={styles.myBalanceBannerBtn}>
                      <Text style={styles.myBalanceBannerBtnText} onPress={() => setSettleOpen(true)}>
                        Acertar →
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {balances.length > 1 && expenses.length > 0 && (
              <>
              {/* Parcelas pendentes */}
              {pendingInstallments.length > 0 && (
                <View style={styles.installmentsCard}>
                  <View style={styles.installmentsHeader}>
                    <Text style={styles.sectionLabel}>💳 Parcelas desta viagem</Text>
                    <Text style={styles.installmentsSubtitle}>{pendingInstallments.length} parcela(s) futura(s)</Text>
                  </View>
                  {pendingInstallments.map((inst: any) => {
                    const due = new Date(inst.expense_date + 'T12:00:00');
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
                    const isOverdue = diffDays < 0;
                    const isUrgent = diffDays >= 0 && diffDays <= 7;
                    const urgencyLabel = isOverdue
                      ? `${Math.abs(diffDays)}d atrasada`
                      : diffDays === 0 ? 'vence hoje'
                      : diffDays === 1 ? 'amanhã'
                      : `em ${diffDays}d`;
                    return (
                      <View key={inst.id} style={[
                        styles.installmentRow,
                        isOverdue && styles.installmentRowOverdue,
                        isUrgent && !isOverdue && styles.installmentRowUrgent,
                      ]}>
                        <View style={styles.installmentDateCol}>
                          <Text style={[styles.installmentDateNum, isOverdue && { color: colors.danger }]}>
                            {due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </Text>
                          <Text style={[
                            styles.installmentUrgency,
                            isOverdue && styles.installmentUrgencyOverdue,
                            isUrgent && !isOverdue && styles.installmentUrgencyUrgent,
                          ]}>
                            {urgencyLabel}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.installmentDesc} numberOfLines={1}>
                            {inst.description}
                          </Text>
                          <View style={styles.installmentBadgeRow}>
                            <View style={styles.installmentBadgeChip}>
                              <Text style={styles.installmentBadge}>{inst.installment_number}/{inst.installments_total}x</Text>
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.installmentAmount, isOverdue && { color: colors.danger }]}>
                          {inst.currency} {inst.amount?.toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.balancesCard}>
                <Text style={styles.sectionLabel}>Saldo por pessoa</Text>                {balances.map((b) => (
                  <View key={b.profileId} style={styles.balanceRow}>
                    <Text style={styles.balanceName}>{b.name}</Text>
                    <Text
                      style={[
                        styles.balanceValue,
                        b.net > 0.01 && styles.balancePositive,
                        b.net < -0.01 && styles.balanceNegative,
                      ]}
                    >
                      {b.net > 0.01 && '+'}
                      {formatCurrency(b.net, trip.base_currency)}
                    </Text>
                  </View>
                ))}
                <Text style={styles.balanceHint}>+ recebe • − deve</Text>
                <Button
                  title="Acertar contas"
                  variant="ghost"
                  size="sm"
                  onPress={() => setSettleOpen(true)}
                  style={styles.settleBtn}
                />
              </View>
              </>
            )}

            <View style={styles.actionRow}>
              <Button
                title="Adicionar despesa"
                variant="secondary"
                leftIcon={<Plus size={16} color={colors.text} />}
                onPress={() => setAddOpen(true)}
                style={styles.actionBtn}
              />
              <Button
                title="Dashboard"
                variant="ghost"
                leftIcon={<BarChart2 size={16} color={colors.primary} />}
                onPress={() => setDashboardOpen(true)}
              />
            </View>

            {expenses.length > 0 && (
              <View style={styles.actionRow}>
                <Button
                  title="Exportar CSV"
                  variant="ghost"
                  leftIcon={<Download size={16} color={colors.textMuted} />}
                  onPress={handleExportCSV}
                />
              </View>
            )}

            <View style={styles.actionRow}>
              <Button
                title="Conversor"
                variant="ghost"
                leftIcon={<Calculator size={16} color={colors.textMuted} />}
                onPress={() => setConverterOpen(true)}
              />
            </View>

            {expenses.length > 0 && (
              <>
                {/* Busca + filtro por categoria */}
                <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                  <View style={styles.searchBox}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Buscar despesas..."
                      placeholderTextColor={colors.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                    />
                  </View>
                  {tripCategories.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      <Pressable
                        onPress={() => setFilterCategory(null)}
                        style={[styles.catFilterChip, !filterCategory && styles.catFilterChipActive]}
                      >
                        <Text style={[styles.catFilterText, !filterCategory && styles.catFilterTextActive]}>Todas</Text>
                      </Pressable>
                      {tripCategories.map((cat) => (
                        <Pressable
                          key={cat.value}
                          onPress={() => setFilterCategory(filterCategory === cat.value ? null : cat.value)}
                          style={[styles.catFilterChip, filterCategory === cat.value && styles.catFilterChipActive]}
                        >
                          <Text style={[styles.catFilterText, filterCategory === cat.value && styles.catFilterTextActive]}>
                            {cat.label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
                <SectionHeader title="Histórico" count={expenses.length} />
              </>
            )}
          </FadeInView>
        }
        ListEmptyComponent={
          (filterCategory || searchQuery) ? (
            <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 32 }}>🔍</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.md }}>Nenhum resultado</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' }}>Tente outro filtro ou busca</Text>
              <Pressable onPress={() => { setFilterCategory(null); setSearchQuery(''); }} style={{ marginTop: 4 }}>
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: fontSize.sm }}>Limpar filtros</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
              icon={<Wallet size={36} color={colors.primary} />}
              title="Nenhuma despesa registrada"
              description="Anote os gastos da viagem e o app divide automaticamente entre os membros."
              action={{ label: 'Adicionar primeira despesa', onPress: () => setAddOpen(true) }}
            />
          )
        }

        renderItem={({ item, index }) => {
          const payer = members.find((m) => m.profile_id === item.paid_by);
          const payerName =
            payer?.profile_id === user?.id
              ? 'Você'
              : payer?.profile?.full_name?.split(' ')[0] ||
                payer?.profile?.email ||
                '?';
          const cat = tripCategories.find((c) => c.value === item.category);
          return (
            <FadeInView delay={getStaggerDelay(index, 35, 220)}>
              <ExpenseRow
                expense={item}
                payerName={payerName}
                tripBaseCurrency={trip.base_currency}
                iconName={cat?.iconName}
                onEdit={() => setEditing(item)}
                onRemove={() => handleRemoveExpense(item)}
              />
            </FadeInView>
          );
        }}
      />

      <AddExpenseModal
        trip={trip}
        members={members}
        visible={addOpen}
        paidByDefault={user?.id ?? ''}
        onClose={() => setAddOpen(false)}
        onSaved={fetchData}
      />

      <AddExpenseModal
        trip={trip}
        members={members}
        visible={editing !== null}
        paidByDefault={user?.id ?? ''}
        expense={editing}
        expenseShares={
          editing ? shares.filter((s) => s.expense_id === editing.id) : []
        }
        onClose={() => setEditing(null)}
        onSaved={fetchData}
      />

      <SettleUpModal
        visible={settleOpen}
        balances={balances}
        baseCurrency={trip.base_currency}
        tripId={trip.id}
        onClose={() => setSettleOpen(false)}
        onSettled={() => {
          fetchData();
        }}
      />

      <CurrencyConverter
        visible={converterOpen}
        onClose={() => setConverterOpen(false)}
        tripBaseCurrency={trip.base_currency as CurrencyCode}
      />

      <ExpenseDashboard
        visible={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        expenses={expenses}
        members={members}
        baseCurrency={trip.base_currency}
        categoryColors={Object.fromEntries(
          categorySegments.map((s) => [s.key, s.color])
        )}
        categoryLabels={Object.fromEntries(
          categorySegments.map((s) => [s.key, s.label])
        )}
        currentUserId={user?.id}
      />
    </>
  );
}


function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    ...shadow.md,
  },
  summaryEmpty: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  // Disco teal sutil atrás do valor (decoração)
  summaryGlow: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.primary,
    opacity: 0.06,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    letterSpacing: letterSpacing.tighter,
    marginVertical: spacing.xs,
  },
  summaryHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  myBalanceBanner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  myBalanceBannerDebt: {
    backgroundColor: colors.danger + '18',
    borderColor: colors.danger + '40',
  },
  myBalanceBannerCredit: {
    backgroundColor: colors.success + '18',
    borderColor: colors.success + '40',
  },
  myBalanceBannerLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  myBalanceBannerValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  myBalanceBannerBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  myBalanceBannerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  myBalanceBannerBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  installmentsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  installmentsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  installmentsSubtitle: {
    color: colors.textMuted, fontSize: fontSize.xs,
  },
  installmentRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  installmentRowOverdue: {
    backgroundColor: colors.danger + '10',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  installmentRowUrgent: {
    backgroundColor: '#f59e0b10',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  installmentDateCol: { width: 60, alignItems: 'center' },
  installmentDateNum: {
    color: colors.text, fontSize: fontSize.sm, fontWeight: '700',
    textAlign: 'center',
  },
  installmentUrgency: {
    color: colors.textMuted, fontSize: 9, textAlign: 'center', fontWeight: '600',
  },
  installmentUrgencyOverdue: { color: colors.danger },
  installmentUrgencyUrgent: { color: '#d97706' },
  installmentBadgeRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  installmentBadgeChip: {
    backgroundColor: colors.primarySoft, borderRadius: radius.pill,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  installmentBadgeText: {
    color: colors.primary, fontSize: 9, fontWeight: '800',
  },
  installmentDesc: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  installmentBadge: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '400',
  },
  installmentDate: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  installmentAmount: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  balancesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  balanceName: { color: colors.text, fontSize: fontSize.md },
  balanceValue: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  balancePositive: { color: colors.success },
  balanceNegative: { color: colors.danger },
  balanceHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  settleBtn: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.primarySoft,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  actionBtn: { flex: 1 },
  searchBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: 10,
  },
  catFilterChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  catFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catFilterText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  catFilterTextActive: { color: '#fff' },
  installBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  installBadgeText: {
    color: colors.primary, fontSize: 9, fontWeight: '800',
  },
  notesDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.textMuted, marginTop: 1,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  expenseTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseContent: { flex: 1 },
  expenseTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  expenseMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  expenseAmount: { alignItems: 'flex-end' },
  expenseValueBase: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  expenseValueOriginal: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    marginRight: spacing.md,
  },
}), [themeVersion]);
}
