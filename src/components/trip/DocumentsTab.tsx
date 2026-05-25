import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Share,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { AnimatedPress } from '@/components/AnimatedPress';
import { ActionSheet, type ActionSheetOption } from '@/components/ActionSheet';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type Trip } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Document = {
  id: string;
  title: string;
  kind: string;
  file_url: string | null;
  is_personal: boolean;
  is_private: boolean;
  uploaded_by: string;
  created_at: string;
  notes: string | null;
  related_item_id: string | null;
  related_item_name: string | null;
};

type ItineraryEntry = { id: string; label: string; kind: 'place' | 'lodging' | 'flight' };

const KIND_META: Record<string, { icon: string; label: string; isPersonal: boolean; isPrivate: boolean }> = {
  flight:     { icon: '✈️', label: 'Passagem aérea',      isPersonal: true,  isPrivate: false },
  hotel:      { icon: '🏨', label: 'Hospedagem',           isPersonal: false, isPrivate: false },
  activity:   { icon: '🎯', label: 'Atividade / Ingresso', isPersonal: false, isPrivate: false },
  insurance:  { icon: '🛡️', label: 'Seguro viagem',       isPersonal: true,  isPrivate: true  },
  visa:       { icon: '📋', label: 'Visto / Passaporte',   isPersonal: true,  isPrivate: true  },
  other:      { icon: '📎', label: 'Outro',                isPersonal: false, isPrivate: false },
};

type Props = { trip: Trip };

export function DocumentsTab({ trip }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showKindSheet, setShowKindSheet] = useState(false);
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [showItemSheet, setShowItemSheet] = useState(false);
  const [itineraryItems, setItineraryItems] = useState<ItineraryEntry[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('documents')
      .select('id, title, kind, file_url, is_personal, is_private, uploaded_by, created_at, notes, related_item_id, related_item_name')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false });
    setDocs((data ?? []) as Document[]);
    setLoading(false);
  }, [trip.id]);

  useFocusEffect(useCallback(() => { fetchDocs(); }, [fetchDocs]));

  async function loadItineraryItems() {
    const entries: ItineraryEntry[] = [];

    // Hospedagens
    const { data: lodgings } = await supabase
      .from('lodgings')
      .select('id, name')
      .eq('trip_id', trip.id)
      .order('check_in_at');
    (lodgings ?? []).forEach((l: any) =>
      entries.push({ id: `lodging:${l.id}`, label: `🏨 ${l.name}`, kind: 'lodging' })
    );

    // Lugares do roteiro
    const { data: days } = await supabase
      .from('trip_days')
      .select('id, day_date')
      .eq('trip_id', trip.id)
      .order('day_date');
    if (days?.length) {
      const { data: items } = await supabase
        .from('itinerary_items')
        .select('id, custom_title, place:places(name, category)')
        .in('trip_day_id', days.map((d: any) => d.id))
        .limit(50);
      (items ?? []).forEach((it: any) => {
        const name = it.custom_title ?? it.place?.name ?? 'Lugar';
        entries.push({ id: `place:${it.id}`, label: `📍 ${name}`, kind: 'place' });
      });
    }

    return entries;
  }

  // Passo 1: escolhe o tipo
  const kindOptions: ActionSheetOption[] = Object.entries(KIND_META).map(([k, v]) => ({
    icon: v.icon,
    label: `${v.label}${v.isPersonal ? '  ·  só para você' : ''}`,
    onPress: async () => {
      setSelectedKind(k);
      // Se é voo ou ingresso de atividade, pergunta a qual item está relacionado
      if (k === 'flight' || k === 'activity' || k === 'hotel') {
        const items = await loadItineraryItems();
        setItineraryItems(items);
        setSelectedItemId(null);
        setShowItemSheet(true);
      } else {
        await doPickAndUpload(k, null, null);
      }
    },
  }));

  // Passo 2 (opcional): vincula a um item do roteiro
  const itemOptions: ActionSheetOption[] = [
    {
      icon: '➖',
      label: 'Sem vínculo específico',
      onPress: () => { setShowItemSheet(false); doPickAndUpload(selectedKind!, null, null); },
    },
    ...itineraryItems.map((it) => {
      // it.id está no formato "place:uuid" ou "lodging:uuid"
      const cleanId = (it.id ?? '').includes(':') ? (it.id ?? '').split(':')[1] : (it.id ?? '');
      return {
        icon: it.kind === 'lodging' ? '🏨' : '📍',
        label: it.label.replace(/^(📍|🏨)\s*/, ''),
        sublabel: it.kind === 'lodging' ? 'Hospedagem' : 'Item do roteiro',
        onPress: () => { setShowItemSheet(false); doPickAndUpload(selectedKind!, cleanId, it.label.replace(/^(📍|🏨)\s*/, '')); },
      };
    }),
  ];

  async function doPickAndUpload(kind: string, relatedId: string | null, relatedName: string | null) {
    if (!user) return;
    setAdding(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) { setAdding(false); return; }

      const file = result.assets[0];
      const meta = KIND_META[kind] ?? KIND_META.other;

      // Lê o arquivo como base64
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64' as any,
      });

      // Decodifica para Uint8Array
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ext = (file.name ?? 'file').split('.').pop() ?? 'pdf';
      const path = `${trip.id}/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, bytes, {
          contentType: file.mimeType ?? 'application/octet-stream',
          upsert: false,
        });

      let fileUrl: string | null = null;
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      } else {
        console.warn('[docs] upload error:', uploadError.message);
      }

      const title = file.name ?? `${meta.label} — ${new Date().toLocaleDateString('pt-BR')}`;

      const { error } = await (supabase as any).from('documents').insert({
        trip_id: trip.id,
        uploaded_by: user.id,
        kind,
        title,
        file_url: fileUrl,
        is_personal: meta.isPersonal,
        is_private: meta.isPrivate,
        profile_id: meta.isPersonal ? user.id : null,
        related_item_id: relatedId,
        related_item_name: relatedName,
      });

      if (error) { toast.error(error.message); setAdding(false); return; }

      const visibility = meta.isPersonal ? 'visível só para você' : 'compartilhado com o grupo';
      toast.success(`${meta.icon} ${meta.label} adicionado — ${visibility}`);
      fetchDocs();
    } catch (e: any) {
      toast.error('Não foi possível adicionar o documento.');
      console.warn('[docs] erro:', e?.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(doc: Document) {
    Alert.alert('Remover documento', `Remover "${doc.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await (supabase as any).from('documents').delete().eq('id', doc.id);
          fetchDocs();
        },
      },
    ]);
  }

  const renderDoc = ({ item }: { item: Document }) => {
    const meta = KIND_META[item.kind] ?? KIND_META.other;
    return (
      <FadeInView>
        <AnimatedPress
          onPress={() => item.file_url && Linking.openURL(item.file_url)}
          onLongPress={() => handleDelete(item)}
          pressScale={0.98}
          style={styles.docCard}
        >
          <View style={styles.docIconWrap}>
            <Text style={styles.docIcon}>{meta.icon}</Text>
          </View>
          <View style={styles.docInfo}>
            <Text style={styles.docTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.docMeta}>
              {meta.label}
              {item.is_private ? '  ·  🔐 Privado' : item.is_personal ? '  ·  🔒 Só você' : '  ·  👥 Grupo'}
              {item.related_item_name ? `\n↳ ${item.related_item_name}` : ''}
            </Text>
          </View>
          {item.file_url && (
            <View style={styles.docActions}>
              <Pressable
                onPress={async () => {
                  if (item.file_url) {
                    await Share.share({ message: `${item.title}: ${item.file_url}`, url: item.file_url });
                  }
                }}
                hitSlop={8}
                style={styles.docShareBtn}
              >
                <Text style={styles.docShareIcon}>↑</Text>
              </Pressable>
              <Text style={styles.docOpen}>Abrir</Text>
            </View>
          )}
        </AnimatedPress>
      </FadeInView>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        renderItem={renderDoc}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDocs} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={docs.length > 0 ? (
          <Text style={styles.hint}>Segure para remover um documento</Text>
        ) : null}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📎"
              title="Nenhum documento ainda"
              description="Guarde passagens, vouchers, seguro viagem, reservas e qualquer arquivo importante aqui."
              action={{ label: '+ Adicionar arquivo', onPress: () => setShowKindSheet(true) }}
            />
          ) : null
        }
      />

      {docs.length > 0 && (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <AnimatedPress
            onPress={() => setShowKindSheet(true)}
            pressScale={0.92}
            style={styles.fab}
            disabled={adding}
          >
            <Text style={styles.fabIcon}>{adding ? '…' : '+'}</Text>
          </AnimatedPress>
        </View>
      )}

      {/* Passo 1 — tipo do documento */}
      <ActionSheet
        visible={showKindSheet}
        title="Que tipo de documento?"
        onClose={() => setShowKindSheet(false)}
        options={kindOptions}
      />

      {/* Passo 2 — vínculo com item do roteiro */}
      <ActionSheet
        visible={showItemSheet}
        title="Vincular a qual item?"
        subtitle="Opcional — o documento aparecerá ao abrir o item vinculado"
        onClose={() => setShowItemSheet(false)}
        options={itemOptions}
      />
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
    hint: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.sm },
    docCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    docIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    docIcon: { fontSize: 24 },
    docInfo: { flex: 1 },
    docTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    docMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
    docActions: {
      alignItems: 'flex-end',
      gap: 6,
    },
    docShareBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    docShareIcon: { color: colors.primary, fontSize: 16, fontWeight: '700' },
    docOpen: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
    fabWrap: { position: 'absolute', bottom: spacing.xl, right: spacing.lg },
    fab: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    fabIcon: { color: '#fff', fontSize: 28, marginTop: -2 },
  }), [themeVersion]);
}
