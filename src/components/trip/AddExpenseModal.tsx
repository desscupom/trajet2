import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { DateField } from '@/components/DateField';
import { Plus } from '@/components/Icon';
import { Input } from '@/components/Input';
import { MoneyInput } from '@/components/MoneyInput';
import { useToast } from '@/components/Toast';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import type { TripMemberWithProfile } from '@/hooks/useTripMembers';
import { toDbDate } from '@/lib/dates';
import { type CurrencyCode, fetchExchangeRate, formatCurrency } from '@/lib/expenses';
import { getIconByName } from '@/lib/expenseIcons';
import {
  calculateShares,
  sumPercentages,
  type SplitMode,
} from '@/lib/splitExpense';
import { supabase, type Trip } from '@/lib/supabase';
import { scheduleLocalNotification } from '@/lib/notifications';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

import { NewCategoryModal } from './NewCategoryModal';
import type { Expense, Share } from './expense/types';
import { ExpenseSplitSection } from './expense/ExpenseSplitSection';
import { ExpenseInstallmentSection } from './expense/ExpenseInstallmentSection';

type Props = {
  trip: Trip;
  members: TripMemberWithProfile[];
  visible: boolean;
  paidByDefault: string;
  /** Quando passada, o modal entra em modo EDIÇÃO (UPDATE em vez de INSERT) */
  expense?: Expense | null;
  /** Shares atuais da despesa em edição. Usado pra pré-popular a divisão. */
  expenseShares?: Share[];
  onClose: () => void;
  onSaved: () => void;
};

const SPLIT_MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Igual' },
  { value: 'amount', label: 'Por valor' },
  { value: 'percent', label: 'Por %' },
];

export function AddExpenseModal({
  trip,
  members,
  visible,
  paidByDefault,
  expense,
  expenseShares,
  onClose,
  onSaved,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const isEditing = !!expense;
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState(''); // mantido para compat
  const [amountNum, setAmountNum] = useState(0);
  const [currency, setCurrency] = useState(trip.base_currency || 'BRL');
  const [category, setCategory] = useState<string>('food');
  const [paidBy, setPaidBy] = useState(paidByDefault);
  const [expenseDate, setExpenseDate] = useState<string>(toDbDate(new Date()));
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Parcelamento
  const [paymentType, setPaymentType] = useState<'avista' | 'parcelado'>('avista');
  const [installmentsTotal, setInstallmentsTotal] = useState(2);
  const [installmentDueDay, setInstallmentDueDay] = useState(10);

  // Categorias da viagem (built-in + customs)
  const { categories, refetch: refetchCategories } = useExpenseCategories(trip.id);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);

  // Vinculação da despesa — itens do roteiro, hospedagens, lugares
  const [itineraryItems, setItineraryItems] = useState<{ id: string; label: string; type: string }[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedLodgingId, setSelectedLodgingId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [showItineraryPicker, setShowItineraryPicker] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible || !trip.id) return;
    async function loadItems() {
      const entries: { id: string; label: string; type: string }[] = [];

      // Hospedagens
      const { data: lodgings } = await supabase
        .from('lodgings')
        .select('id, name, kind, check_in_at')
        .eq('trip_id', trip.id)
        .order('check_in_at');
      (lodgings ?? []).forEach((l: any) => {
        const date = l.check_in_at
          ? new Date(l.check_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : '';
        const kindIcon = l.kind === 'flight' ? '✈️' : l.kind === 'hotel' ? '🏨' : l.kind === 'airbnb' ? '🏠' : '🛏️';
        entries.push({ id: `lodging:${l.id}`, label: `${kindIcon} ${l.name}${date ? ` · ${date}` : ''}`, type: 'lodging' });
      });

      // Itens do roteiro (lugares)
      const { data: days } = await supabase
        .from('trip_days').select('id, day_date').eq('trip_id', trip.id).order('day_date');
      if (days?.length) {
        const dayIds = days.map((d: any) => d.id);
        const dayMap: Record<string, string> = {};
        days.forEach((d: any) => { dayMap[d.id] = d.day_date; });
        const { data: items } = await supabase
          .from('itinerary_items')
          .select('id, custom_title, start_time, trip_day_id, place:places(name, category)')
          .in('trip_day_id', dayIds).order('trip_day_id').order('position').limit(80);
        (items ?? []).forEach((it: any) => {
          const name = it.custom_title ?? it.place?.name ?? 'Sem nome';
          const date = dayMap[it.trip_day_id]
            ? new Date(dayMap[it.trip_day_id] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
          const time = it.start_time ? ` ${it.start_time.slice(0, 5)}` : '';
          entries.push({ id: `item:${it.id}`, label: `📍 ${name}${date ? ` · ${date}${time}` : ''}`, type: 'item' });
        });
      }

      setItineraryItems(entries);
    }
    loadItems();
  }, [visible, trip.id]);

  // Divisão — modo + valores
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [splitWith, setSplitWith] = useState<Set<string>>(
    () => new Set(members.map((m) => m.profile_id))
  );
  /** Pra modo 'amount' e 'percent' */
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    if (expense) {
      // Modo edição: pré-popula TODOS os campos com valores atuais
      setDescription(expense.description);
      // Garante que amount vem formatado corretamente (ex: 1234.56 → "1234,56")
      const amountVal = typeof expense.amount === 'number' ? expense.amount : parseFloat(String(expense.amount)) || 0;
      setAmountStr(amountVal.toFixed(2).replace('.', ','));
      setAmountNum(amountVal);
      setCurrency(expense.currency);
      setCategory(expense.category ?? 'food');
      setPaidBy(expense.paid_by);
      setExpenseDate(expense.expense_date.split('T')[0]);
      setSplitMode('equal');
      // Reconstrói splitWith a partir dos shares
      const shareMembers = new Set(
        (expenseShares ?? []).filter((s) => s.share_amount > 0).map((s) => s.member_id)
      );
      setSplitWith(
        shareMembers.size > 0
          ? shareMembers
          : new Set(members.map((m) => m.profile_id))
      );
      setSplitValues({});
      setExchangeRate(expense.exchange_rate ?? 1);
      // Restaura tipo de pagamento e parcelamento
      const pType = (expense as any).payment_type;
      setPaymentType(pType === 'parcelado' ? 'parcelado' : 'avista');
      if (pType === 'parcelado') {
        setInstallmentsTotal((expense as any).installments_total ?? 2);
        setInstallmentDueDay((expense as any).installment_due_day ?? 10);
      }
      setNotes((expense as any).notes ?? '');
    } else {
      // Modo criação: estado limpo
      setDescription('');
      setAmountStr('');
      setAmountNum(0);
      setCurrency(trip.base_currency || 'BRL');
      setCategory('food');
      setPaidBy(paidByDefault);
      setExpenseDate(toDbDate(new Date()));
      setSplitMode('equal');
      setSplitWith(new Set(members.map((m) => m.profile_id)));
      setSplitValues({});
      setExchangeRate(null);
      setSelectedItemId(null);
      setShowItineraryPicker(false);
      setPaymentType('avista');
      setInstallmentsTotal(2);
      setInstallmentDueDay(10);
      setNotes('');
    }
  }, [visible, expense, expenseShares, trip.base_currency, paidByDefault, members]);

  useEffect(() => {
    if (!visible) return;
    if (currency === trip.base_currency) {
      setExchangeRate(1);
      return;
    }
    let mounted = true;
    setFetchingRate(true);
    fetchExchangeRate(currency, trip.base_currency, expenseDate).then((rate) => {
      if (!mounted) return;
      setExchangeRate(rate);
      setFetchingRate(false);
    });
    return () => {
      mounted = false;
    };
  }, [currency, trip.base_currency, expenseDate, visible]);

  // Quando muda de modo, limpa os valores customizados
  useEffect(() => {
    setSplitValues({});
  }, [splitMode]);

  function toggleSplitMember(memberId: string) {
    setSplitWith((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function setSplitValue(memberId: string, value: string) {
    setSplitValues((prev) => ({ ...prev, [memberId]: value }));
  }

  // Parse pro número (handle vazio/invalid)
  const amount = parseFloat(amountStr.replace(',', '.'));
  const amountValid = !isNaN(amount) && amount > 0;

  // Calcula resultado da divisão em tempo real
  const splitResult = useMemo(() => {
    const numericValues: Record<string, number> = {};
    for (const [id, str] of Object.entries(splitValues)) {
      const n = parseFloat(str.replace(',', '.'));
      if (!isNaN(n)) numericValues[id] = n;
    }
    return calculateShares(
      amountValid ? amount : 0,
      splitMode,
      {
        values: numericValues,
        selectedIds: splitWith,
      },
      members.map((m) => m.profile_id)
    );
  }, [amount, amountValid, splitMode, splitValues, splitWith, members]);

  const percentageSum = useMemo(() => {
    if (splitMode !== 'percent') return 0;
    const numericValues: Record<string, number> = {};
    for (const [id, str] of Object.entries(splitValues)) {
      const n = parseFloat(str.replace(',', '.'));
      if (!isNaN(n)) numericValues[id] = n;
    }
    return sumPercentages(numericValues);
  }, [splitMode, splitValues]);

  async function handleSave() {
    if (!description.trim()) {
      toast.error('Adicione uma descrição.');
      return;
    }
    if (!amountValid) {
      toast.error('Digite um valor maior que zero.');
      return;
    }
    if (exchangeRate === null) {
      toast.error('Não consegui obter a taxa de câmbio.');
      return;
    }
    if (!splitResult.isValid) {
      if (splitMode === 'equal') {
        toast.error('Selecione ao menos uma pessoa para dividir.');
      } else if (splitMode === 'percent') {
        toast.error('A soma das porcentagens precisa ser 100%.');
      } else {
        toast.error(
          `Faltam ${formatCurrency(Math.abs(splitResult.remaining), currency)} pra fechar o total.`
        );
      }
      return;
    }

    setSaving(true);
    const amountInBase = amount * exchangeRate;

    // Resolve vínculos do seletor combinado (lodging:ID ou item:ID)
    const linkId = selectedItemId;
    const linkedLodgingId = linkId?.startsWith('lodging:') ? linkId.replace('lodging:', '') : null;
    const linkedItemId = linkId?.startsWith('item:') ? linkId.replace('item:', '') : null;

    const payload = {
      trip_id: trip.id,
      paid_by: paidBy,
      amount,
      currency,
      amount_in_base: amountInBase,
      exchange_rate: exchangeRate,
      description: description.trim(),
      category,
      expense_date: expenseDate,
      itinerary_item_id: linkedItemId,
      lodging_id: linkedLodgingId,
      notes: notes.trim() || null,
      payment_type: paymentType,
      installments_total: paymentType === 'parcelado' ? installmentsTotal : 1,
      installment_number: 1,
      installment_start_date: paymentType === 'parcelado' ? expenseDate : null,
      installment_due_day: paymentType === 'parcelado' ? installmentDueDay : null,
    };

    let savedExpenseId: string;

    if (isEditing && expense) {
      // UPDATE
      const { error: updateError } = await (supabase as any)
        .from('expenses')
        .update(payload)
        .eq('id', expense.id);

      if (updateError) {
        setSaving(false);
        toast.error(updateError.message);
        return;
      }

      // Apaga shares antigos pra recriar com nova divisão
      const { error: deleteSharesError } = await supabase
        .from('expense_shares')
        .delete()
        .eq('expense_id', expense.id);

      if (deleteSharesError) {
        setSaving(false);
        toast.error(deleteSharesError.message);
        return;
      }

      savedExpenseId = expense.id;
    } else {
      // INSERT
      const { data: newExpense, error: insertError } = await (supabase as any)
        .from('expenses')
        .insert(payload)
        .select()
        .single();

      if (insertError || !newExpense) {
        setSaving(false);
        toast.error(insertError?.message ?? 'Erro ao salvar.');
        return;
      }

      savedExpenseId = newExpense.id;
    }

    // Insere shares (mesma lógica pra criar OU editar — sempre recria)
    const shares = Object.entries(splitResult.sharesOriginal).map(
      ([memberId, shareOriginal]) => ({
        expense_id: savedExpenseId,
        member_id: memberId,
        share_amount: shareOriginal * exchangeRate,
      })
    );

    const { error: sharesError } = await supabase
      .from('expense_shares')
      .insert(shares);

    setSaving(false);

    if (sharesError) {
      // Em modo criação, rollback. Em edição, deixa o user re-tentar.
      if (!isEditing) {
        await supabase.from('expenses').delete().eq('id', savedExpenseId);
      }
      toast.error(sharesError.message);
      return;
    }

    toast.success(isEditing ? 'Despesa atualizada.' : 'Despesa adicionada.');

    // Cria registros de parcelas futuras se for parcelado
    if (!isEditing && paymentType === 'parcelado' && installmentsTotal > 1) {
      const parcelas: any[] = [];
      const baseDate = new Date(expenseDate + 'T12:00:00');
      for (let i = 2; i <= installmentsTotal; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        dueDate.setDate(installmentDueDay);
        parcelas.push({
          ...payload,
          installment_number: i,
          installment_start_date: expenseDate,
          expense_date: dueDate.toISOString().slice(0, 10),
          parent_expense_id: savedExpenseId,
          // Mantém a mesma divisão
        });
      }
      if (parcelas.length > 0) {
        const { data: parcelasCreated } = await (supabase as any)
          .from('expenses')
          .insert(parcelas)
          .select('id');

        // Recria shares para cada parcela (mesmo split da primeira)
        if (parcelasCreated) {
          const { data: firstShares } = await supabase
            .from('expense_shares')
            .select('profile_id, share_amount, share_percent')
            .eq('expense_id', savedExpenseId);
          if (firstShares?.length) {
            const allParcelaShares: any[] = [];
            parcelasCreated.forEach((p: any) => {
              firstShares.forEach((s: any) => {
                allParcelaShares.push({ expense_id: p.id, profile_id: s.profile_id, share_amount: s.share_amount, share_percent: s.share_percent });
              });
            });
            await supabase.from('expense_shares').insert(allParcelaShares);
          }
        }
      }
      const totalPerPerson = (amount / (splitWith.size || 1)).toFixed(2);
      const parcPerPerson = (amount / (splitWith.size || 1) / installmentsTotal).toFixed(2);
      toast.success(`${installmentsTotal}x de ${currency} ${parcPerPerson}/pessoa — dia ${installmentDueDay} todo mês.`);

      // Agenda lembretes locais para cada parcela futura (7 dias antes e no dia)
      for (let i = 2; i <= installmentsTotal; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        dueDate.setDate(installmentDueDay);

        const perPerson = amount / (splitWith.size || 1) / installmentsTotal;
        const label = `${i}ª/${installmentsTotal}x — ${description.trim()} (${currency} ${perPerson.toFixed(2)})`;

        // Lembrete 7 dias antes (às 9h)
        const week7Before = new Date(dueDate);
        week7Before.setDate(week7Before.getDate() - 7);
        week7Before.setHours(9, 0, 0, 0);
        await scheduleLocalNotification({
          title: '💳 Parcela em 7 dias',
          body: label,
          triggerAt: week7Before,
          data: { type: 'installment_reminder', expenseId: savedExpenseId },
        }).catch(() => {});

        // Lembrete no dia (às 8h)
        const onDue = new Date(dueDate);
        onDue.setHours(8, 0, 0, 0);
        await scheduleLocalNotification({
          title: '💳 Parcela vencendo hoje',
          body: label,
          triggerAt: onDue,
          data: { type: 'installment_due', expenseId: savedExpenseId },
        }).catch(() => {});
      }
    }

    onSaved();
    onClose();
  }

  const showConversion =
    currency !== trip.base_currency && amountValid && exchangeRate !== null;
  const convertedAmount = showConversion ? amount * exchangeRate! : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
            <View style={styles.headerDragBar} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>{isEditing ? 'Editar despesa' : 'Nova despesa'}</Text>
              <Button title="Cancelar" variant="ghost" size="sm" onPress={onClose} />
            </View>
          </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Input
              label="Descrição"
              value={description}
              onChangeText={setDescription}
              placeholder="Ex: jantar no Hard Rock"
              autoCapitalize="sentences"
            />

            <View style={styles.row}>
              <View style={styles.amountField}>
                <MoneyInput
                  label="Valor"
                  value={amountNum}
                  onChange={(v) => { setAmountNum(v); setAmountStr(String(v).replace('.', ',')); }}
                  currency={currency}
                  autoFocus={false}
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Moeda</Text>
                <CurrencyPicker
                  value={currency as CurrencyCode}
                  onChange={(code) => setCurrency(code)}
                  variant="inline"
                />
              </View>
            </View>

            {fetchingRate && (
              <View style={styles.rateInfo}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.rateText}>Buscando câmbio…</Text>
              </View>
            )}
            {!fetchingRate && showConversion && (
              <View style={styles.rateInfo}>
                <Text style={styles.rateText}>
                  ≈ {formatCurrency(convertedAmount, trip.base_currency)} (1{' '}
                  {currency} = {exchangeRate?.toFixed(4)} {trip.base_currency})
                </Text>
              </View>
            )}
            {!fetchingRate &&
              currency !== trip.base_currency &&
              exchangeRate === null && (
                <View style={styles.rateError}>
                  <Text style={styles.rateErrorText}>
                    Não consegui buscar a taxa. Tente outra moeda ou data.
                  </Text>
                </View>
              )}

            <View>
              <Text style={styles.fieldLabel}>Categoria</Text>
              <View style={styles.chipRow}>
                {categories.map((cat) => {
                  const Icon = getIconByName(cat.iconName);
                  const isActive = category === cat.value;
                  return (
                    <Pressable
                      key={cat.value}
                      onPress={() => setCategory(cat.value)}
                      style={[styles.categoryChip, isActive && styles.chipActive]}
                    >
                      <Icon
                        size={14}
                        color={isActive ? colors.primaryTextOnSolid : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          isActive && styles.chipTextActive,
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setNewCategoryOpen(true)}
                  style={styles.newCategoryChip}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={styles.newCategoryText}>Nova</Text>
                </Pressable>
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Quem pagou</Text>
              <View style={styles.chipRow}>
                {members.map((m) => {
                  const name = m.profile?.full_name || m.profile?.email || '?';
                  const isActive = paidBy === m.profile_id;
                  return (
                    <Pressable
                      key={m.profile_id}
                      onPress={() => setPaidBy(m.profile_id)}
                      style={[styles.memberChip, isActive && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, isActive && styles.chipTextActive]}
                      >
                        {(name ?? '').split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* DIVISÃO */}
            <ExpenseSplitSection
              members={members}
              currency={currency}
              amount={amount}
              amountValid={amountValid}
              splitMode={splitMode}
              splitWith={splitWith}
              splitValues={splitValues}
              splitResult={splitResult}
              percentageSum={percentageSum}
              onChangeSplitMode={setSplitMode}
              onToggleMember={toggleSplitMember}
              onChangeSplitValue={setSplitValue}
            />

            <DateField
              label="Data"
              value={expenseDate}
              onChange={(d) => d && setExpenseDate(d)}
            />

            {/* PARCELAMENTO */}
            <ExpenseInstallmentSection
              paymentType={paymentType}
              installmentsTotal={installmentsTotal}
              installmentDueDay={installmentDueDay}
              expenseDate={expenseDate}
              amount={amount}
              currency={currency}
              splitWithSize={splitWith.size}
              onChangePaymentType={setPaymentType}
              onChangeInstallments={setInstallmentsTotal}
              onChangeDueDay={setInstallmentDueDay}
            />

            {/* Associar a — hospedagem, lugar do roteiro ou voo */}
            {itineraryItems.length > 0 && (
              <View>
                <Text style={styles.fieldLabel}>Vincular a (opcional)</Text>
                <Pressable
                  style={styles.itineraryPicker}
                  onPress={() => setShowItineraryPicker(!showItineraryPicker)}
                >
                  <Text style={selectedItemId ? styles.itinerarySelected : styles.itineraryPlaceholder} numberOfLines={1}>
                    {selectedItemId
                      ? itineraryItems.find(i => i.id === selectedItemId)?.label ?? 'Item selecionado'
                      : 'Sem vínculo'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {showItineraryPicker ? '▲' : '▼'}
                  </Text>
                </Pressable>
                {showItineraryPicker && (
                  <View style={styles.itineraryList}>
                    <Pressable
                      style={[styles.itineraryOption, !selectedItemId && styles.itineraryOptionActive]}
                      onPress={() => { setSelectedItemId(null); setShowItineraryPicker(false); }}
                    >
                      <Text style={[styles.itineraryOptionText, !selectedItemId && { color: colors.primary }]}>
                        ✕  Sem vínculo
                      </Text>
                    </Pressable>
                    {/* Separadores por tipo */}
                    {['lodging', 'item'].map(type => {
                      const group = itineraryItems.filter(i => i.type === type);
                      if (!group.length) return null;
                      return (
                        <View key={type}>
                          <Text style={styles.itineraryGroupHeader}>
                            {type === 'lodging' ? '🏨  HOSPEDAGENS' : '📍  ROTEIRO'}
                          </Text>
                          {group.map((item) => (
                            <Pressable
                              key={item.id}
                              style={[styles.itineraryOption, selectedItemId === item.id && styles.itineraryOptionActive]}
                              onPress={() => { setSelectedItemId(item.id); setShowItineraryPicker(false); }}
                            >
                              <Text
                                style={[styles.itineraryOptionText, selectedItemId === item.id && { color: colors.primary, fontWeight: '600' }]}
                                numberOfLines={1}
                              >
                                {item.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Observações */}
            <Input
              label="Observações (opcional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: dividido 50/50 no app"
              multiline
            />

            <Button
              title="Salvar despesa"
              onPress={handleSave}
              loading={saving}
              style={styles.saveBtn}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Modal de criar nova categoria — ao criar, auto-seleciona */}
      <NewCategoryModal
        visible={newCategoryOpen}
        onClose={() => setNewCategoryOpen(false)}
        tripId={trip.id}
        onCreated={(slug) => { setCategory(slug); refetchCategories(); }}
      />
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerDragBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: letterSpacing.tight,
  },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', gap: spacing.md },
  amountField: { flex: 1 },
  currencyField: { flex: 0 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    letterSpacing: letterSpacing.wide,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  newCategoryText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  memberChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' },
  chipTextActive: { color: colors.primaryTextOnSolid, fontWeight: '600' },
  rateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  rateText: { color: colors.textMuted, fontSize: fontSize.sm },
  rateError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  rateErrorText: { color: colors.danger, fontSize: fontSize.sm },

  // SPLIT CARD
  splitCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: letterSpacing.tight,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    ...shadow.sm,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '700',
  },
  memberList: {
    gap: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.primaryTextOnSolid,
    fontSize: 14,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  memberShare: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 110,
  },
  amountInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
    padding: 0,
  },
  amountUnit: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  percentPreview: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  allocationFooter: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  allocationValid: {
    backgroundColor: colors.successSoft,
  },
  allocationText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  allocationWarn: {
    color: colors.warning,
  },
  saveBtn: { marginTop: spacing.md },
  itineraryPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
  },
  itinerarySelected: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  itineraryPlaceholder: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    flex: 1,
  },
  itineraryList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    overflow: 'hidden',
    maxHeight: 220,
  },
  paymentToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  paymentBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  paymentBtnActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  paymentBtnText: {
    color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600',
  },
  paymentBtnTextActive: {
    color: '#fff',
  },
  installmentBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  installmentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  installmentLabel: {
    color: colors.textMuted, fontSize: fontSize.sm,
  },
  installmentStepper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  stepperBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { color: colors.text, fontSize: 18, fontWeight: '600', lineHeight: 20 },
  stepperValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  installmentPreview: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
  },
  installmentPreviewTitle: {
    color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', marginBottom: 2,
  },
  installmentPreviewLine: {
    color: colors.text, fontSize: fontSize.xs, lineHeight: 18,
  },
  itineraryGroupHeader: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    backgroundColor: colors.surfaceAlt,
  },
  itineraryOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  itineraryOptionActive: {
    backgroundColor: colors.primarySofter,
  },
  itineraryOptionText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
}), [themeVersion]);
}
