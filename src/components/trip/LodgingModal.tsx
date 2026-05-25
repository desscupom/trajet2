import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { DateField } from '@/components/DateField';
import { TimeField } from '@/components/TimeField';
import { MapPin, Search, Trash, Wallet } from '@/components/Icon';
import { Input } from '@/components/Input';
import { LODGING_KIND_ICONS } from '@/components/lodgingIcons';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { ImportLodgingModal } from '@/components/trip/ImportLodgingModal';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { getPrefsForCurrentUser } from '@/hooks/useNotificationPreferences';
import { type CurrencyCode, fetchExchangeRate } from '@/lib/expenses';
import {
  cancelLodgingCheckInReminder,
  scheduleLodgingCheckInReminder,
} from '@/lib/lodgingNotifications';
import {
  LODGING_KIND_LABELS,
  type Lodging,
  type LodgingKind,
} from '@/lib/lodgings';
import { supabase } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Quando passada, o modal entra em modo edição */
  lodging?: Lodging | null;
  tripId: string;
  tripBaseCurrency: string;
  /** Pra dar contexto de cidade na busca de lugares */
  tripTitle: string;
  /** Se a feature de despesas está ativa, mostra "adicionar como despesa" */
  tripFeatureExpenses?: boolean;
};

const KIND_OPTIONS: LodgingKind[] = ['hotel', 'airbnb', 'hostel', 'house', 'other'];

import { combineDateTime, extractTime, extractDate } from '@/lib/lodgingUtils';

export function LodgingModal({
  visible,
  onClose,
  lodging,
  tripId,
  tripBaseCurrency,
  tripTitle,
  tripFeatureExpenses,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const isEditing = !!lodging;

  const [kind, setKind] = useState<LodgingKind>('hotel');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [checkInDate, setCheckInDate] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutDate, setCheckOutDate] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState('11:00');

  const [reservationCode, setReservationCode] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(tripBaseCurrency);
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncingExpense, setSyncingExpense] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importAIOpen, setImportAIOpen] = useState(false);

  // Carrega valores quando abre em modo edição
  useEffect(() => {
    if (!visible) return;
    if (lodging) {
      setKind((lodging.kind as LodgingKind) ?? 'hotel');
      setName(lodging.name ?? '');
      setAddress(lodging.address ?? '');
      setLatitude(lodging.latitude);
      setLongitude(lodging.longitude);
      setCheckInDate(extractDate(lodging.check_in_at));
      setCheckInTime(extractTime(lodging.check_in_at) || '15:00');
      setCheckOutDate(extractDate(lodging.check_out_at));
      setCheckOutTime(extractTime(lodging.check_out_at) || '11:00');
      setReservationCode(lodging.reservation_code ?? '');
      setCostAmount(lodging.cost_amount ? String(lodging.cost_amount) : '');
      setCostCurrency(lodging.cost_currency ?? tripBaseCurrency);
      setNotes(lodging.notes ?? '');
      setWebsite((lodging as any).website ?? '');
      setPhone((lodging as any).phone ?? '');
      setWifiPassword((lodging as any).wifi_password ?? '');
      setAmenities(((lodging as any).amenities as string[]) ?? []);
      setShowAdvanced(
        !!(lodging.reservation_code || lodging.cost_amount || lodging.notes
          || (lodging as any).website || (lodging as any).phone)
      );
    } else {
      // Reset pra criar novo
      setKind('hotel');
      setName('');
      setAddress('');
      setLatitude(null);
      setLongitude(null);
      setCheckInDate(null);
      setCheckInTime('15:00');
      setCheckOutDate(null);
      setCheckOutTime('11:00');
      setReservationCode('');
      setCostAmount('');
      setCostCurrency(tripBaseCurrency);
      setNotes('');
      setWebsite('');
      setPhone('');
      setWifiPassword('');
      setAmenities([]);
      setShowAdvanced(false);
    }
  }, [visible, lodging, tripBaseCurrency]);

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    const inMs = new Date(checkInDate).getTime();
    const outMs = new Date(checkOutDate).getTime();
    return Math.max(0, Math.round((outMs - inMs) / (1000 * 60 * 60 * 24)));
  }, [checkInDate, checkOutDate]);

  function handlePickPlace(place: {
    name: string;
    fullAddress: string;
    latitude: number | null;
    longitude: number | null;
  }) {
    setAddress(place.fullAddress);
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    // Se nome ainda tá vazio, usa o nome do lugar
    if (!name.trim()) setName(place.name);
  }

  async function handleSave() {
    if (!user) return;
    if (!name.trim()) {
      toast.error('Dê um nome pra hospedagem.');
      return;
    }
    if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
      toast.error('Check-out precisa ser depois do check-in.');
      return;
    }
    const parsedCost = costAmount ? parseFloat(costAmount.replace(',', '.')) : null;
    if (costAmount && (isNaN(parsedCost!) || parsedCost! < 0)) {
      toast.error('Valor inválido.');
      return;
    }

    setSaving(true);

    const payload = {
      trip_id: tripId,
      kind,
      name: name.trim(),
      address: address.trim() || null,
      latitude,
      longitude,
      check_in_at: combineDateTime(checkInDate, checkInTime, 15),
      check_out_at: combineDateTime(checkOutDate, checkOutTime, 11),
      reservation_code: reservationCode.trim() || null,
      cost_amount: parsedCost,
      cost_currency: parsedCost ? costCurrency : null,
      notes: notes.trim() || null,
      website: website.trim() || null,
      phone: phone.trim() || null,
      wifi_password: wifiPassword.trim() || null,
      amenities,
      created_by: user.id,
    };

    let savedId: string | null = null;
    let saveError: { message: string } | null = null;

    if (isEditing) {
      const { error } = await supabase
        .from('lodgings')
        .update(payload)
        .eq('id', lodging.id);
      saveError = error;
      savedId = lodging.id;
    } else {
      const { data, error } = await supabase
        .from('lodgings')
        .insert(payload)
        .select('id')
        .single();
      saveError = error;
      savedId = data?.id ?? null;
    }

    setSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    // Agenda/cancela lembrete local de check-in conforme prefs do user.
    // Faz best-effort — se falhar, não bloqueia o save.
    if (savedId) {
      try {
        const { prefs } = await getPrefsForCurrentUser();
        const wantsReminder =
          prefs?.notifications_enabled &&
          prefs?.lodging_checkin_reminder &&
          !!payload.check_in_at;

        if (wantsReminder) {
          await scheduleLodgingCheckInReminder(
            savedId,
            payload.name,
            payload.check_in_at!,
            prefs?.lodging_checkin_offset_minutes ?? 120
          );
        } else {
          // Garante que não há lembrete pendente (ex: user removeu data de check-in)
          await cancelLodgingCheckInReminder(savedId);
        }
      } catch (e) {
        console.warn('Falha ao agendar lembrete:', e);
      }
    }

    toast.success(isEditing ? 'Hospedagem atualizada.' : 'Hospedagem adicionada.');

    // Notifica membros ao adicionar nova hospedagem
    if (!isEditing && user?.id) {
      import('@/lib/sendPush').then(({ sendPushToTripMembers }) => {
        sendPushToTripMembers({
          tripId,
          excludeProfileId: user.id!,
          title: tripTitle,
          body: `🏨 ${name.trim()} adicionada ao planejamento`,
          data: { type: 'lodging_added', tripId },
        }).catch(() => {});
      });
    }

    onClose();
  }

  /**
   * Cria ou atualiza despesa vinculada a essa hospedagem.
   * Usa o user atual como `paid_by` (depois ele pode editar).
   * Calcula o exchange rate pra moeda base da viagem.
   */
  async function handleSyncExpense() {
    if (!lodging || !user) return;
    if (!lodging.cost_amount || !lodging.cost_currency) {
      toast.error('Preencha o valor antes.');
      return;
    }

    setSyncingExpense(true);

    // Calcula taxa de câmbio (1 se mesma moeda)
    const expenseDate = lodging.check_in_at
      ? new Date(lodging.check_in_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let rate = 1;
    if (lodging.cost_currency !== tripBaseCurrency) {
      const fetched = await fetchExchangeRate(
        lodging.cost_currency,
        tripBaseCurrency,
        expenseDate
      );
      if (fetched === null) {
        setSyncingExpense(false);
        toast.error('Não foi possível buscar a taxa de câmbio.');
        return;
      }
      rate = fetched;
    }

    const expensePayload = {
      trip_id: lodging.trip_id,
      description: `🏨 ${lodging.name}`,
      amount: lodging.cost_amount,
      currency: lodging.cost_currency,
      amount_in_base: lodging.cost_amount * rate,
      exchange_rate: rate,
      paid_by: user.id,
      category: 'lodging',
      expense_date: expenseDate,
    };

    if (lodging.expense_id) {
      // Update existente
      const { error } = await supabase
        .from('expenses')
        .update(expensePayload)
        .eq('id', lodging.expense_id);
      setSyncingExpense(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Despesa atualizada.');
      return;
    }

    // Cria nova
    const { data, error } = await supabase
      .from('expenses')
      .insert(expensePayload)
      .select('id')
      .single();

    if (error || !data) {
      setSyncingExpense(false);
      toast.error(error?.message ?? 'Erro ao criar despesa.');
      return;
    }

    // Linka na hospedagem
    await supabase
      .from('lodgings')
      .update({ expense_id: data.id })
      .eq('id', lodging.id);

    setSyncingExpense(false);
    toast.success('Despesa criada.');
  }

  function handleDelete() {
    if (!lodging) return;
    Alert.alert(
      'Excluir hospedagem?',
      `"${lodging.name}" será removida da viagem.${
        lodging.expense_id
          ? ' A despesa ligada NÃO será removida.'
          : ''
      }`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase
              .from('lodgings')
              .delete()
              .eq('id', lodging.id);
            setDeleting(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            // Best-effort: cancela lembrete local agendado
            try {
              await cancelLodgingCheckInReminder(lodging.id);
            } catch {}
            toast.success('Hospedagem excluída.');
            onClose();
          },
        },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          {/* ── Header ─────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerDragBar} />
            <View style={styles.headerContent}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.title}>
                  {isEditing ? 'Editar hospedagem' : 'Nova hospedagem'}
                </Text>
                <Pressable onPress={onClose} hitSlop={12} style={styles.headerCloseBtn}>
                  <Text style={styles.headerCloseBtnText}>✕</Text>
                </Pressable>
              </View>
              {!isEditing && (
                <Button
                  title="✨ Importar com IA"
                  variant="secondary"
                  size="sm"
                  onPress={() => setImportAIOpen(true)}
                  style={{ alignSelf: 'flex-start' }}
                />
              )}
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tipo */}
            <View>
              <Text style={styles.fieldLabel}>Tipo</Text>
              <View style={styles.kindRow}>
                {KIND_OPTIONS.map((k) => {
                  const Icon = LODGING_KIND_ICONS[k];
                  const active = kind === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setKind(k)}
                      style={[styles.kindChip, active && styles.kindChipActive]}
                    >
                      <Icon
                        size={16}
                        color={active ? colors.primaryTextOnSolid : colors.text}
                      />
                      <Text
                        style={[
                          styles.kindChipText,
                          active && styles.kindChipTextActive,
                        ]}
                      >
                        {LODGING_KIND_LABELS[k]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Input
              label="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Ex: Hotel Avenida Palace"
              autoCapitalize="sentences"
            />

            {/* Endereço — abre busca */}
            <View>
              <Text style={styles.fieldLabel}>Endereço</Text>
              <Pressable
                onPress={() => setSearchOpen(true)}
                style={styles.addressBox}
              >
                {address ? (
                  <>
                    <MapPin size={14} color={colors.primary} />
                    <Text style={styles.addressText} numberOfLines={2}>
                      {address}
                    </Text>
                  </>
                ) : (
                  <>
                    <Search size={14} color={colors.textMuted} />
                    <Text style={styles.addressPlaceholder}>
                      Buscar endereço (opcional)
                    </Text>
                  </>
                )}
              </Pressable>
              {address && (
                <Pressable
                  onPress={() => {
                    setAddress('');
                    setLatitude(null);
                    setLongitude(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clearText}>Limpar</Text>
                </Pressable>
              )}
            </View>

            {/* Datas */}
            <View>
              <View style={styles.dateGroup}>
                <View style={styles.dateField}>
                  <DateField
                    label="Check-in"
                    value={checkInDate}
                    onChange={setCheckInDate}
                    optional
                  />
                </View>
                <View style={styles.timeFieldWrap}>
                  <TimeField
                    label="Hora"
                    value={checkInTime || null}
                    onChange={(v) => setCheckInTime(v || '15:00')}
                  />
                </View>
              </View>

              <View style={[styles.dateGroup, { marginTop: spacing.sm }]}>
                <View style={styles.dateField}>
                  <DateField
                    label="Check-out"
                    value={checkOutDate}
                    onChange={setCheckOutDate}
                    minDate={checkInDate}
                    optional
                  />
                </View>
                <View style={styles.timeFieldWrap}>
                  <TimeField
                    label="Hora"
                    value={checkOutTime || null}
                    onChange={(v) => setCheckOutTime(v || '11:00')}
                  />
                </View>
              </View>

              {nights > 0 && (
                <Text style={styles.nightsHint}>
                  {nights} {nights === 1 ? 'noite' : 'noites'}
                </Text>
              )}
            </View>

            {/* Avançado: código, valor, notas */}
            <Pressable
              onPress={() => setShowAdvanced((v) => !v)}
              style={styles.advancedToggle}
            >
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? '−' : '+'} Detalhes
              </Text>
              <Text style={styles.advancedToggleHint}>
                Código de reserva, valor, notas
              </Text>
            </Pressable>

            {showAdvanced && (
              <View style={styles.advancedSection}>
                <Input
                  label="Código de reserva"
                  value={reservationCode}
                  onChangeText={setReservationCode}
                  placeholder="Ex: ABC123"
                  autoCapitalize="characters"
                />

                <View style={styles.amountRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Valor total"
                      value={costAmount}
                      onChangeText={setCostAmount}
                      placeholder="0,00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <CurrencyPicker
                    value={costCurrency as CurrencyCode}
                    onChange={(code) => setCostCurrency(code)}
                    variant="inline"
                  />
                </View>

                <Input
                  label="Site / link de reserva"
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="booking.com/..."
                  keyboardType="url"
                  autoCapitalize="none"
                />

                <Input
                  label="Telefone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+351 21 000 0000"
                  keyboardType="phone-pad"
                />

                <Input
                  label="Senha do Wi-Fi"
                  value={wifiPassword}
                  onChangeText={setWifiPassword}
                  placeholder="Senha da rede do local"
                  autoCapitalize="none"
                />

                {/* Amenidades */}
                <View>
                  <Text style={styles.amenLabel}>Comodidades</Text>
                  <View style={styles.amenRow}>
                    {Object.entries({
                      wifi: '📶 Wi-Fi',
                      breakfast: '🍳 Café da manhã',
                      parking: '🅿️ Estacionamento',
                      pool: '🏊 Piscina',
                      gym: '💪 Academia',
                      ac: '❄️ Ar condicionado',
                      pets: '🐶 Pets',
                      kitchen: '🍴 Cozinha',
                    }).map(([key, label]) => {
                      const active = amenities.includes(key);
                      return (
                        <Pressable
                          key={key}
                          onPress={() =>
                            setAmenities((prev) =>
                              active
                                ? prev.filter((a) => a !== key)
                                : [...prev, key]
                            )
                          }
                          style={[
                            styles.amenChip,
                            active && styles.amenChipActive,
                          ]}
                        >
                          <Text style={[styles.amenChipText, active && { color: colors.primary }]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Input
                  label="Notas"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Instruções de check-in, observações..."
                  multiline
                  numberOfLines={3}
                  style={styles.textarea}
                  autoCapitalize="sentences"
                />
              </View>
            )}

            {isEditing && lodging && tripFeatureExpenses !== false && lodging.cost_amount && (
              <Pressable
                onPress={handleSyncExpense}
                disabled={syncingExpense}
                style={styles.expenseRow}
              >
                <Wallet size={16} color={colors.primary} />
                <Text style={styles.expenseText}>
                  {syncingExpense
                    ? 'Sincronizando...'
                    : lodging.expense_id
                    ? 'Atualizar despesa ligada'
                    : 'Adicionar como despesa'}
                </Text>
              </Pressable>
            )}

            {isEditing && (
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                style={styles.deleteRow}
              >
                <Trash size={16} color={colors.danger} />
                <Text style={styles.deleteText}>
                  {deleting ? 'Excluindo…' : 'Excluir hospedagem'}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title={isEditing ? 'Salvar mudanças' : 'Adicionar hospedagem'}
              onPress={handleSave}
              loading={saving}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Modal de busca de lugares */}
      <PlaceSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handlePickPlace}
        tripContext={tripTitle}
      />

      {/* Modal de importação com IA */}
      {importAIOpen && (
        <ImportLodgingModal
          visible={importAIOpen}
          trip={{ id: tripId, title: tripTitle, base_currency: tripBaseCurrency } as any}
          onClose={() => setImportAIOpen(false)}
          onImported={() => { setImportAIOpen(false); onClose(); }}
        />
      )}
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerDragBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginTop: spacing.sm,
  },
  headerContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCloseBtnText: {
    color: colors.textMuted, fontSize: 14, fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  kindChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  kindChipText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  kindChipTextActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '700',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 50,
  },
  addressText: { flex: 1, color: colors.text, fontSize: fontSize.sm },
  addressPlaceholder: { flex: 1, color: colors.textMuted, fontSize: fontSize.sm },
  clearText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  dateGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  dateField: { flex: 1 },
  timeInput: { width: 90 },
  timeFieldWrap: { width: 110 },
  nightsHint: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  advancedToggle: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.sm,
  },
  advancedToggleText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  advancedToggleHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  advancedSection: { gap: spacing.md },
  amenLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  amenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amenChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amenChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  amenChipText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  deleteText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  expenseText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  footer: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
}), [themeVersion]);
}
