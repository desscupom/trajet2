import {useEffect, useState, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { MapPin, Search, X } from '@/components/Icon';
import { PlaceSearchModal } from '@/components/PlaceSearchModal';
import { useToast } from '@/components/Toast';
import {
  createGeoReminder,
  deleteGeoReminder,
  type GeoReminder,
  updateGeoReminder,
} from '@/lib/geoReminders';
import { syncGeofencesWithOS } from '@/lib/geofencingTask';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: GeoReminder | null;
  prefilledTripId?: string | null;
  onSaved: () => void;
};

/** Opções pré-definidas de raio (em metros) */
const RADIUS_OPTIONS = [
  { value: 100, label: '100 m', hint: 'Edifício' },
  { value: 200, label: '200 m', hint: 'Quarteirão' },
  { value: 500, label: '500 m', hint: 'Bairro' },
  { value: 1000, label: '1 km', hint: 'Região' },
  { value: 5000, label: '5 km', hint: 'Cidade pequena' },
];

/**
 * Modal pra criar/editar um lembrete baseado em localização.
 *
 * Fluxo:
 * 1. User digita título (ex: "Comprar SIM card")
 * 2. Toca "Escolher lugar" → abre PlaceSearchModal (OSM)
 * 3. Escolhe raio + trigger (enter/exit) + repeat
 * 4. Salva → sincroniza geofences com OS
 */
export function GeoReminderModal({
  visible,
  onClose,
  editing,
  prefilledTripId,
  onSaved,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const isEditing = !!editing;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [place, setPlace] = useState<{
    name: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [radiusM, setRadiusM] = useState(200);
  const [triggerOn, setTriggerOn] = useState<'enter' | 'exit'>('enter');
  const [repeat, setRepeat] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editing) {
        setTitle(editing.title);
        setBody(editing.body ?? '');
        setPlace({
          name: editing.place_name ?? 'Local salvo',
          latitude: editing.latitude,
          longitude: editing.longitude,
        });
        setRadiusM(editing.radius_m);
        setTriggerOn(editing.trigger_on);
        setRepeat(editing.repeat);
      } else {
        setTitle('');
        setBody('');
        setPlace(null);
        setRadiusM(200);
        setTriggerOn('enter');
        setRepeat(false);
      }
    }
  }, [visible, editing]);

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Informe um título.');
      return;
    }
    if (!place) {
      toast.error('Escolha um lugar.');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && editing) {
        await updateGeoReminder(editing.id, {
          title: title.trim(),
          body: body.trim() || null,
          radius_m: radiusM,
          trigger_on: triggerOn,
          repeat,
        });
        toast.success('Lembrete atualizado.');
      } else {
        await createGeoReminder({
          title: title.trim(),
          body: body.trim() || undefined,
          latitude: place.latitude,
          longitude: place.longitude,
          radiusM,
          placeName: place.name,
          triggerOn,
          repeat,
          tripId: prefilledTripId ?? null,
        });
        toast.success('Lembrete criado.');
      }

      // Sincroniza geofences com OS em background (não trava UX)
      syncGeofencesWithOS().catch(() => {});

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    try {
      await deleteGeoReminder(editing.id);
      syncGeofencesWithOS().catch(() => {});
      toast.success('Lembrete deletado.');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro.');
    }
  }

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isEditing ? 'Editar lembrete' : 'Lembrete no local'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            >
              <View style={styles.intro}>
                <View style={styles.iconWrap}>
                  <MapPin size={24} color={colors.primary} />
                </View>
                <Text style={styles.introHint}>
                  Você vai receber notificação quando{' '}
                  {triggerOn === 'enter' ? 'chegar' : 'sair'} desse lugar.
                </Text>
              </View>

              <Text style={styles.label}>O que lembrar</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ex: Comprar SIM card"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                maxLength={100}
              />

              <Text style={styles.label}>Detalhes (opcional)</Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Detalhes ou observações..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
                style={[styles.input, styles.inputMulti]}
                textAlignVertical="top"
                maxLength={300}
              />

              <Text style={styles.label}>Onde</Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={styles.pickerBtn}
              >
                {place ? (
                  <>
                    <MapPin size={16} color={colors.primary} />
                    <Text style={styles.pickerText} numberOfLines={2}>
                      {place.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Search size={16} color={colors.textMuted} />
                    <Text style={styles.pickerPlaceholder}>
                      Escolher um lugar…
                    </Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.label}>Raio do alerta</Text>
              <View style={styles.radiusRow}>
                {RADIUS_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setRadiusM(opt.value)}
                    style={[
                      styles.radiusBtn,
                      radiusM === opt.value && styles.radiusBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.radiusLabel,
                        radiusM === opt.value && styles.radiusLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.radiusHint}>{opt.hint}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Quando notificar</Text>
              <View style={styles.triggerRow}>
                <Pressable
                  onPress={() => setTriggerOn('enter')}
                  style={[
                    styles.triggerBtn,
                    triggerOn === 'enter' && styles.triggerBtnActive,
                  ]}
                >
                  <Text style={styles.triggerEmoji}>📍</Text>
                  <Text
                    style={[
                      styles.triggerLabel,
                      triggerOn === 'enter' && styles.triggerLabelActive,
                    ]}
                  >
                    Ao chegar
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTriggerOn('exit')}
                  style={[
                    styles.triggerBtn,
                    triggerOn === 'exit' && styles.triggerBtnActive,
                  ]}
                >
                  <Text style={styles.triggerEmoji}>👋</Text>
                  <Text
                    style={[
                      styles.triggerLabel,
                      triggerOn === 'exit' && styles.triggerLabelActive,
                    ]}
                  >
                    Ao sair
                  </Text>
                </Pressable>
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Repetir sempre</Text>
                  <Text style={styles.toggleHint}>
                    {repeat
                      ? 'Vai notificar toda vez'
                      : 'Notifica só uma vez'}
                  </Text>
                </View>
                <Switch
                  value={repeat}
                  onValueChange={setRepeat}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              {isEditing && (
                <Button
                  title="Deletar lembrete"
                  variant="danger"
                  onPress={handleDelete}
                  fullWidth
                  style={{ marginTop: spacing.lg }}
                />
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Button
                title={isEditing ? 'Salvar' : 'Criar lembrete'}
                variant="primary"
                onPress={handleSave}
                loading={saving}
                disabled={!place || !title.trim()}
                leftIcon={<MapPin size={14} color={colors.primaryTextOnSolid} />}
                fullWidth
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <PlaceSearchModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => {
          setPlace({
            name: picked.name,
            latitude: picked.latitude,
            longitude: picked.longitude,
          });
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 180,
  },
  intro: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  introHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputMulti: {
    minHeight: 60,
  },
  pickerBtn: {
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
  pickerText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  pickerPlaceholder: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  radiusBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 90,
    alignItems: 'center',
  },
  radiusBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  radiusLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  radiusLabelActive: {
    color: colors.primary,
  },
  radiusHint: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  triggerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  triggerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  triggerEmoji: { fontSize: 18 },
  triggerLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  triggerLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
}), [themeVersion]);
}
