/**
 * EditItineraryItemModal — permite editar as informações de um item do roteiro:
 * - Nome personalizado (sobrescreve o nome do lugar)
 * - Notas/observações (campo de texto livre)
 * - Horário e duração (redireciona para o SmartTimeModal ou EditTimeModal)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Image,
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

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { Clock, Edit, MapPin, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { ItineraryItem } from '@/components/trip/types';

type Props = {
  visible: boolean;
  item: ItineraryItem | null;
  onClose: () => void;
  onSaved: () => void;
  onEditTime?: () => void;
};

export function EditItineraryItemModal({
  visible, item, onClose, onSaved, onEditTime,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const [customTitle, setCustomTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setCustomTitle(item.custom_title ?? '');
      setNotes(item.notes ?? '');
    }
  }, [item]);

  if (!item) return null;

  const placeName = item.place?.name ?? item.custom_title ?? 'Lugar';
  const hasCustomTitle = customTitle.trim() && customTitle.trim() !== placeName;
  const displayName = hasCustomTitle ? customTitle.trim() : placeName;

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    const { error } = await supabase
      .from('itinerary_items')
      .update({
        custom_title: customTitle.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', item.id);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Lugar atualizado!');
    onSaved();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <MapPin size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
              {item.place?.address && (
                <Text style={styles.headerSub} numberOfLines={1}>{item.place.address}</Text>
              )}
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Horário — botão rápido */}
            <View style={styles.timeCard}>
              <View style={styles.timeLeft}>
                <Clock size={16} color={colors.primary} />
                <View>
                  <Text style={styles.timeLabel}>Horário e duração</Text>
                  <Text style={styles.timeValue}>
                    {item.start_time
                      ? `${item.start_time.slice(0, 5)}${item.duration_minutes ? ` · ${item.duration_minutes >= 60 ? `${Math.floor(item.duration_minutes / 60)}h${item.duration_minutes % 60 ? String(item.duration_minutes % 60).padStart(2, '0') : ''}` : `${item.duration_minutes}min`}` : ''}`
                      : 'Não definido'}
                  </Text>
                </View>
              </View>
              <AnimatedPress
                onPress={() => { onClose(); setTimeout(() => onEditTime?.(), 150); }}
                pressScale={0.95}
                style={styles.editTimeBtn}
              >
                <Edit size={14} color={colors.primary} />
                <Text style={styles.editTimeBtnText}>Editar</Text>
              </AnimatedPress>
            </View>

            {/* Nome personalizado */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nome personalizado</Text>
              <Text style={styles.fieldHint}>
                Substitui o nome original "{placeName}"
              </Text>
              <TextInput
                value={customTitle}
                onChangeText={setCustomTitle}
                placeholder={placeName}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="done"
                clearButtonMode="while-editing"
              />
            </View>

            {/* Notas / Observações */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Observações</Text>
              <Text style={styles.fieldHint}>
                Anotações visíveis para todos os membros
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Adicione observações para os membros da viagem..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.inputMulti]}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={500}
              />
              {notes.length > 400 && (
                <Text style={styles.charCount}>{500 - notes.length} caracteres restantes</Text>
              )}
            </View>

            {/* Info do lugar */}
            {item.place && (
              <View style={styles.placeInfo}>
                {/* Foto do local */}
                {(item.place as any).photo_url && (
                  <Image
                    source={{ uri: (item.place as any).photo_url }}
                    style={styles.placePhoto}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.placeInfoTitle}>Sobre o lugar</Text>
                {item.place.address && (
                  <View style={styles.placeInfoRow}>
                    <Text style={styles.placeInfoIcon}>📍</Text>
                    <Text style={styles.placeInfoText}>{item.place.address}</Text>
                  </View>
                )}
                {item.place.category && (
                  <View style={styles.placeInfoRow}>
                    <Text style={styles.placeInfoIcon}>🏷️</Text>
                    <Text style={styles.placeInfoText}>{item.place.category}</Text>
                  </View>
                )}
                {(item.place.latitude && item.place.longitude) && (
                  <AnimatedPress
                    onPress={() => {
                      const { Linking } = require('react-native');
                      const name = encodeURIComponent(item.place!.name);
                      const lat = item.place!.latitude;
                      const lng = item.place!.longitude;
                      const placeId = (item.place as any).google_place_id ?? '';
                      Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${name}&query_place_id=${placeId}&center=${lat},${lng}`
                      );
                    }}
                    pressScale={0.97}
                    style={styles.mapsBtn}
                  >
                    <Text style={styles.mapsBtnText}>🗺️ Abrir no Google Maps</Text>
                  </AnimatedPress>
                )}
              </View>
            )}

            <Button
              title={saving ? 'Salvando...' : 'Salvar'}
              onPress={handleSave}
              loading={saving}
              style={styles.saveBtn}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headerIcon: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    headerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
    closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
    timeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    timeLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500' },
    timeValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', marginTop: 2 },
    editTimeBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.primarySoft, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 6,
    },
    editTimeBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
    field: { gap: spacing.xs },
    fieldLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    fieldHint: { color: colors.textMuted, fontSize: fontSize.xs },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      fontSize: fontSize.sm,
    },
    inputMulti: { minHeight: 110, paddingTop: spacing.md },
    charCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right' },
    placePhoto: {
      width: '100%',
      height: 140,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
    },
    placeInfo: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    placeInfoTitle: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    placeInfoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    placeInfoIcon: { fontSize: 13, marginTop: 1 },
    placeInfoText: { flex: 1, color: colors.text, fontSize: fontSize.xs, lineHeight: 18 },
    mapsBtn: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    mapsBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
    saveBtn: { marginTop: spacing.xs },
  }), [themeVersion]);
}
