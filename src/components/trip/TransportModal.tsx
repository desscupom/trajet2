/**
 * TransportModal — adiciona ou edita qualquer meio de transporte.
 * Suporta: voo, ônibus, trem, carro, balsa, metrô, táxi, uber, etc.
 */
import { useState, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { TimeField } from '@/components/TimeField';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { Trip } from '@/lib/supabase';
import type { SearchResult } from '@/lib/places';
import { BottomSheet } from '@/components/BottomSheet';

// ── Tipos de transporte ────────────────────────────────────────────────────────
export type TransportType =
  | 'flight' | 'bus' | 'train' | 'car' | 'ferry'
  | 'subway' | 'taxi' | 'rideshare' | 'motorcycle' | 'bicycle' | 'walking' | 'other';

export type Transport = {
  id: string;
  trip_id: string;
  type: TransportType;
  origin_name: string;
  origin_address?: string | null;
  origin_code?: string | null;
  origin_latitude?: number | null;
  origin_longitude?: number | null;
  destination_name: string;
  destination_address?: string | null;
  destination_code?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  departs_at?: string | null;
  arrives_at?: string | null;
  duration_minutes?: number | null;
  operator?: string | null;
  number?: string | null;
  platform?: string | null;
  reservation_code?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
  is_personal?: boolean;
  notes?: string | null;
};

export const TRANSPORT_META: Record<TransportType, { icon: string; label: string; originLabel: string; destLabel: string; numberLabel?: string; operatorLabel?: string }> = {
  flight:     { icon: '✈', label: 'Voo',          originLabel: 'Aeroporto de origem', destLabel: 'Aeroporto de destino', numberLabel: 'Número do voo', operatorLabel: 'Companhia aérea' },
  bus:        { icon: '⊟', label: 'Ônibus',        originLabel: 'Terminal de origem', destLabel: 'Terminal de destino', numberLabel: 'Número da linha', operatorLabel: 'Empresa' },
  train:      { icon: '⊞', label: 'Trem',          originLabel: 'Estação de origem', destLabel: 'Estação de destino', numberLabel: 'Número do trem', operatorLabel: 'Operadora' },
  car:        { icon: '⊡', label: 'Carro',         originLabel: 'Saindo de', destLabel: 'Indo para', operatorLabel: 'Locadora / placa' },
  ferry:      { icon: '⚓', label: 'Barco',         originLabel: 'Porto de origem', destLabel: 'Porto de destino', numberLabel: 'Número', operatorLabel: 'Empresa' },
  subway:     { icon: '◉', label: 'Metrô',         originLabel: 'Estação de origem', destLabel: 'Estação de destino', numberLabel: 'Linha', operatorLabel: 'Operadora' },
  taxi:       { icon: '◈', label: 'Táxi',          originLabel: 'Saindo de', destLabel: 'Indo para' },
  rideshare:  { icon: '◈', label: 'App (Uber)',    originLabel: 'Saindo de', destLabel: 'Indo para', operatorLabel: 'App' },
  motorcycle: { icon: '◪', label: 'Moto',          originLabel: 'Saindo de', destLabel: 'Indo para' },
  bicycle:    { icon: '○', label: 'Bicicleta',     originLabel: 'Saindo de', destLabel: 'Indo para' },
  walking:    { icon: '→', label: 'A pé',          originLabel: 'Saindo de', destLabel: 'Indo para' },
  other:      { icon: '·', label: 'Outro',         originLabel: 'Origem', destLabel: 'Destino', operatorLabel: 'Operadora' },
};

// Grupos de tipos para exibição no seletor
const TYPE_GROUPS = [
  { label: 'Principais', types: ['flight', 'bus', 'train', 'car'] as TransportType[] },
  { label: 'Outros', types: ['ferry', 'subway', 'taxi', 'rideshare', 'motorcycle', 'bicycle', 'walking', 'other'] as TransportType[] },
];

type Props = {
  visible: boolean;
  trip: Trip;
  transport?: Transport | null;
  onClose: () => void;
  onSaved: () => void;
};

export function TransportModal({ visible, trip, transport, onClose, onSaved }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const isEditing = !!transport;

  // Estado
  const [type, setType] = useState<TransportType>(transport?.type ?? 'flight');
  const [originName, setOriginName] = useState(transport?.origin_name ?? '');
  const [originCode, setOriginCode] = useState(transport?.origin_code ?? '');
  const [originLat, setOriginLat] = useState<number | null>(transport?.origin_latitude ?? null);
  const [originLng, setOriginLng] = useState<number | null>(transport?.origin_longitude ?? null);
  const [destName, setDestName] = useState(transport?.destination_name ?? '');
  const [destCode, setDestCode] = useState(transport?.destination_code ?? '');
  const [destLat, setDestLat] = useState<number | null>(transport?.destination_latitude ?? null);
  const [destLng, setDestLng] = useState<number | null>(transport?.destination_longitude ?? null);
  const [departsDate, setDepartsDate] = useState<string | null>(transport?.departs_at?.slice(0, 10) ?? null);
  const [departsTime, setDepartsTime] = useState<string | null>(transport?.departs_at?.slice(11, 16) ?? null);
  const [arrivesDate, setArrivesDate] = useState<string | null>(transport?.arrives_at?.slice(0, 10) ?? null);
  const [arrivesTime, setArrivesTime] = useState<string | null>(transport?.arrives_at?.slice(11, 16) ?? null);
  const [operator, setOperator] = useState(transport?.operator ?? '');
  const [number, setNumber] = useState(transport?.number ?? '');
  const [platform, setPlatform] = useState(transport?.platform ?? '');
  const [reservationCode, setReservationCode] = useState(transport?.reservation_code ?? '');
  const [costAmount, setCostAmount] = useState(transport?.cost_amount?.toString() ?? '');
  const [notes, setNotes] = useState(transport?.notes ?? '');
  const [isPersonal, setIsPersonal] = useState(transport?.is_personal ?? false);
  const [saving, setSaving] = useState(false);
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [pickingDest, setPickingDest] = useState(false);

  const meta = TRANSPORT_META[type];

  function resetAndClose() {
    onClose();
  }

  function handlePickOrigin(result: SearchResult) {
    setOriginName(result.name);
    setOriginLat(result.latitude ?? null);
    setOriginLng(result.longitude ?? null);
    setPickingOrigin(false);
  }

  function handlePickDest(result: SearchResult) {
    setDestName(result.name);
    setDestLat(result.latitude ?? null);
    setDestLng(result.longitude ?? null);
    setPickingDest(false);
  }

  async function handleSave() {
    if (!user) return;
    if (!originName.trim()) { toast.error('Informe a origem.'); return; }
    if (!destName.trim()) { toast.error('Informe o destino.'); return; }

    setSaving(true);

    const departsAt = departsDate
      ? `${departsDate}T${departsTime ?? '00:00'}:00`
      : null;
    const arrivesAt = arrivesDate
      ? `${arrivesDate}T${arrivesTime ?? '00:00'}:00`
      : null;

    const payload: any = {
      trip_id: trip.id,
      created_by: user.id,
      type,
      origin_name: originName.trim(),
      origin_code: originCode.trim() || null,
      origin_latitude: originLat,
      origin_longitude: originLng,
      destination_name: destName.trim(),
      destination_code: destCode.trim() || null,
      destination_latitude: destLat,
      destination_longitude: destLng,
      departs_at: departsAt,
      arrives_at: arrivesAt,
      operator: operator.trim() || null,
      number: number.trim() || null,
      platform: platform.trim() || null,
      reservation_code: reservationCode.trim() || null,
      cost_amount: costAmount ? parseFloat(costAmount) : null,
      cost_currency: trip.base_currency ?? 'BRL',
      is_personal: isPersonal,
      profile_id: isPersonal ? user.id : null,
      notes: notes.trim() || null,
    };

    const { error } = isEditing
      ? await (supabase as any).from('transports').update(payload).eq('id', transport!.id)
      : await (supabase as any).from('transports').insert(payload);

    setSaving(false);

    if (error) { toast.error(error.message); return; }

    toast.success(isEditing ? 'Transporte atualizado.' : `${meta.icon} ${meta.label} adicionado!`);
    onSaved();
    onClose();
  }

  return (
    <>
      <BottomSheet
        visible={visible && !pickingOrigin && !pickingDest}
        onClose={resetAndClose}
        title={isEditing ? 'Editar transporte' : 'Novo transporte'}
        subtitle={isEditing ? transport?.origin_name + ' → ' + transport?.destination_name : undefined}
        maxHeightPct={0.95}
        footer={
          <Button
            title={isEditing ? 'Salvar alterações' : `Adicionar ${meta.label}`}
            onPress={handleSave}
            loading={saving}
          />
        }
      >
        {/* Seletor de tipo */}
        <View>
          <Text style={styles.sectionLabel}>Tipo de transporte</Text>
          {TYPE_GROUPS.map((group) => (
            <View key={group.label}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.typeRow}>
                {group.types.map((t) => {
                  const m = TRANSPORT_META[t];
                  return (
                    <AnimatedPress
                      key={t}
                      onPress={() => setType(t)}
                      pressScale={0.92}
                      style={[styles.typeChip, type === t && styles.typeChipActive]}
                    >
                      <Text style={styles.typeChipIcon}>{m.icon}</Text>
                      <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                        {m.label}
                      </Text>
                    </AnimatedPress>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Origem */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeIcon}>🟢</Text>
            <Text style={styles.routeLabel}>Origem</Text>
          </View>
          <Pressable
            style={styles.locationBtn}
            onPress={() => setPickingOrigin(true)}
          >
            <Text style={originName ? styles.locationText : styles.locationPlaceholder} numberOfLines={1}>
              {originName || `Buscar ${meta.originLabel.toLowerCase()}...`}
            </Text>
          </Pressable>
          {(type === 'flight' || type === 'train' || type === 'bus' || type === 'ferry') && (
            <Input
              label="Código (ex: GRU, Roma Termini)"
              value={originCode}
              onChangeText={setOriginCode}
              autoCapitalize="characters"
              style={styles.codeInput}
            />
          )}
          <View style={styles.dateTimeRow}>
            <View style={{ flex: 2 }}>
              <DateField label="Data de partida" value={departsDate} onChange={setDepartsDate} optional />
            </View>
            {departsDate && (
              <View style={{ flex: 1 }}>
                <TimeField label="Hora" value={departsTime} onChange={setDepartsTime} optional />
              </View>
            )}
          </View>
          {(type === 'flight' || type === 'train' || type === 'bus') && platform && (
            <Input label="Portão / Plataforma" value={platform} onChangeText={setPlatform} style={styles.codeInput} />
          )}
          {!platform && (type === 'flight' || type === 'train' || type === 'bus') && (
            <Pressable onPress={() => setPlatform(' ')} style={{ marginTop: 4 }}>
              <Text style={styles.addFieldLink}>+ Portão / Plataforma</Text>
            </Pressable>
          )}
        </View>

        {/* Destino */}
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeIcon}>🔴</Text>
            <Text style={styles.routeLabel}>Destino</Text>
          </View>
          <Pressable
            style={styles.locationBtn}
            onPress={() => setPickingDest(true)}
          >
            <Text style={destName ? styles.locationText : styles.locationPlaceholder} numberOfLines={1}>
              {destName || `Buscar ${meta.destLabel.toLowerCase()}...`}
            </Text>
          </Pressable>
          {(type === 'flight' || type === 'train' || type === 'bus' || type === 'ferry') && (
            <Input
              label="Código"
              value={destCode}
              onChangeText={setDestCode}
              autoCapitalize="characters"
              style={styles.codeInput}
            />
          )}
          <View style={styles.dateTimeRow}>
            <View style={{ flex: 2 }}>
              <DateField label="Data de chegada" value={arrivesDate} onChange={setArrivesDate} optional />
            </View>
            {arrivesDate && (
              <View style={{ flex: 1 }}>
                <TimeField label="Hora" value={arrivesTime} onChange={setArrivesTime} optional />
              </View>
            )}
          </View>
        </View>

        {/* Detalhes */}
        <View>
          <Text style={styles.sectionLabel}>Detalhes</Text>
          <View style={styles.detailsGrid}>
            {meta.operatorLabel && (
              <Input label={meta.operatorLabel} value={operator} onChangeText={setOperator} />
            )}
            {meta.numberLabel && (
              <Input label={meta.numberLabel} value={number} onChangeText={setNumber} autoCapitalize="characters" />
            )}
            {!meta.numberLabel && type !== 'walking' && type !== 'bicycle' && (
              <Input label="Referência" value={number} onChangeText={setNumber} />
            )}
            <Input label="Código de reserva" value={reservationCode} onChangeText={setReservationCode} autoCapitalize="characters" />
            <Input
              label={`Custo (${trip.base_currency ?? 'BRL'})`}
              value={costAmount}
              onChangeText={setCostAmount}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Input
          label="Observações"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Bagagem, refeição, informações extras..."
        />

        {/* Visibilidade */}
        <View style={styles.visibilityRow}>
          <Pressable
            style={[styles.visBtn, !isPersonal && styles.visBtnActive]}
            onPress={() => setIsPersonal(false)}
          >
            <Text style={[styles.visBtnText, !isPersonal && styles.visBtnTextActive]}>👥 Grupo</Text>
          </Pressable>
          <Pressable
            style={[styles.visBtn, isPersonal && styles.visBtnActive]}
            onPress={() => setIsPersonal(true)}
          >
            <Text style={[styles.visBtnText, isPersonal && styles.visBtnTextActive]}>🔒 Só eu</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <PlaceSearchModal
        visible={pickingOrigin}
        onClose={() => setPickingOrigin(false)}
        onPick={handlePickOrigin}
      />
      <PlaceSearchModal
        visible={pickingDest}
        onClose={() => setPickingDest(false)}
        onPick={handlePickDest}
      />
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    sectionLabel: {
      color: colors.textMuted, fontSize: fontSize.xs,
      fontWeight: '700', letterSpacing: 0.8,
      textTransform: 'uppercase', marginBottom: spacing.sm,
    },
    groupLabel: {
      color: colors.textMuted, fontSize: 9,
      fontWeight: '700', letterSpacing: 1,
      marginBottom: 4, marginTop: spacing.xs,
    },
    typeRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
    },
    typeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 8,
    },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipIcon: { fontSize: 16 },
    typeChipText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
    typeChipTextActive: { color: '#fff' },
    routeCard: {
      backgroundColor: colors.surface, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.md, gap: spacing.sm,
    },
    routeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    routeIcon: { fontSize: 12 },
    routeLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
    locationBtn: {
      backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
      padding: spacing.md, minHeight: 48, justifyContent: 'center',
    },
    locationText: { color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
    locationPlaceholder: { color: colors.textMuted, fontSize: fontSize.md },
    codeInput: { marginTop: 0 },
    dateTimeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
    addFieldLink: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
    detailsGrid: { gap: spacing.sm },
    visibilityRow: { flexDirection: 'row', gap: spacing.sm },
    visBtn: {
      flex: 1, paddingVertical: 12, borderRadius: radius.md,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      alignItems: 'center',
    },
    visBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    visBtnText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
    visBtnTextActive: { color: '#fff' },
  }), [themeVersion]);
}
