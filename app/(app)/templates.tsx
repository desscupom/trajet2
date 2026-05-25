import { Stack, useRouter } from 'expo-router';
import {useCallback, useEffect, useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import {
  Globe,
  MapPin,
  Search,
  Sparkles,
  Trash2,
  User as UserIcon,
} from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import {
  deleteTemplate,
  listMyTemplates,
  listPublicTemplates,
  PACE_LABELS_PT,
  setTemplatePublic,
  STYLE_LABELS_PT,
  type ItineraryTemplate,
} from '@/lib/itineraryTemplates';
import type { SuggestionPace, SuggestionStyle } from '@/lib/itinerarySuggester';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type TabKey = 'mine' | 'gallery';

/**
 * Galeria de roteiros gerados por IA.
 *
 * - Aba "Meus": templates que o user gerou (públicos ou privados)
 * - Aba "Galeria": templates de outros users marcados como públicos
 *
 * User pode:
 * - Tornar próprio template público/privado (toggle)
 * - Deletar próprio template
 * - Ver detalhes (preview de dias)
 *
 * Pra "usar" um template numa viagem nova: criar viagem com destino igual
 * e estilo/pace iguais — o SuggestItineraryModal vai automaticamente pegar
 * via cache. (Sem fluxo direto de "usar este template" por enquanto pra
 * manter UX simples.)
 */
export default function TemplatesScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<TabKey>('mine');
  const [mine, setMine] = useState<ItineraryTemplate[]>([]);
  const [gallery, setGallery] = useState<ItineraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [m, g] = await Promise.all([
        listMyTemplates(),
        listPublicTemplates(),
      ]);
      setMine(m);
      setGallery(g);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshProps = usePullToRefresh(fetchData);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleTogglePublic(template: ItineraryTemplate) {
    const newState = !template.is_public;
    try {
      await setTemplatePublic(template.id, newState);
      setMine((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, is_public: newState } : t,
        ),
      );
      toast.success(
        newState ? 'Compartilhado na galeria!' : 'Removido da galeria.',
      );
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro.');
    }
  }

  function handleDelete(template: ItineraryTemplate) {
    Alert.alert(
      'Deletar template?',
      `${template.destination} · ${template.days_count} dias`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTemplate(template.id);
              await fetchData();
              toast.success('Deletado.');
            } catch (err: any) {
              toast.error(err?.message ?? 'Erro.');
            }
          },
        },
      ],
    );
  }

  // Filtra por search (destino)
  const filtered = (tab === 'mine' ? mine : gallery).filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return t.destination.toLowerCase().includes(q);
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Galeria de roteiros' }} />
    <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Tabs */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setTab('mine')}
            style={[styles.tab, tab === 'mine' && styles.tabActive]}
          >
            <UserIcon size={14} color={tab === 'mine' ? colors.primary : colors.textMuted} />
            <Text
              style={[
                styles.tabLabel,
                tab === 'mine' && styles.tabLabelActive,
              ]}
            >
              Meus ({mine.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('gallery')}
            style={[styles.tab, tab === 'gallery' && styles.tabActive]}
          >
            <Globe size={14} color={tab === 'gallery' ? colors.primary : colors.textMuted} />
            <Text
              style={[
                styles.tabLabel,
                tab === 'gallery' && styles.tabLabelActive,
              ]}
            >
              Galeria ({gallery.length})
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por destino..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>

        {loading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={120} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={<Sparkles size={28} color={colors.primary} />}
              title={
                tab === 'mine'
                  ? 'Nenhum template ainda'
                  : 'Galeria vazia'
              }
              description={
                tab === 'mine'
                  ? 'Quando você gerar um roteiro com IA, ele fica salvo aqui automaticamente. Você pode reaproveitá-lo depois sem gastar tokens.'
                  : 'Quando outros usuários compartilharem roteiros, vão aparecer aqui.'
              }
            />
          </View>
        ) : (
          <FlatList keyboardShouldPersistTaps="handled"
            data={filtered}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl {...refreshProps} />}
            renderItem={({ item }) => (
              <FadeInView>
                <TemplateCard
                  template={item}
                  isMine={tab === 'mine'}
                  onTogglePublic={() => handleTogglePublic(item)}
                  onDelete={() => handleDelete(item)}
                />
              </FadeInView>
            )}
          />
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

function TemplateCard({
  template,
  isMine,
  onTogglePublic,
  onDelete,
}: {
  template: ItineraryTemplate;
  isMine: boolean;
  onTogglePublic: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const styleLabel = template.style
    ? STYLE_LABELS_PT[template.style as SuggestionStyle] ?? template.style
    : null;
  const paceLabel = template.pace
    ? PACE_LABELS_PT[template.pace as SuggestionPace] ?? template.pace
    : null;

  const totalItems = (template.data?.days ?? []).reduce(
    (sum, d) => sum + (d.items?.length ?? 0),
    0,
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <MapPin size={18} color={colors.primary} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {template.destination}
          </Text>
          <Text style={styles.cardSubtitle}>
            {template.days_count} {template.days_count === 1 ? 'dia' : 'dias'}
            {' · '}
            {totalItems} {totalItems === 1 ? 'lugar' : 'lugares'}
          </Text>
        </View>
        {template.reuse_count > 0 && (
          <View style={styles.reuseBadge}>
            <Text style={styles.reuseBadgeText}>
              ⚡ {template.reuse_count}
            </Text>
          </View>
        )}
      </View>

      {(styleLabel || paceLabel) && (
        <View style={styles.tagsRow}>
          {styleLabel && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{styleLabel}</Text>
            </View>
          )}
          {paceLabel && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{paceLabel}</Text>
            </View>
          )}
          {template.is_public && (
            <View style={[styles.tag, styles.tagPublic]}>
              <Globe size={10} color={colors.success} />
              <Text style={[styles.tagText, { color: colors.success }]}>
                Público
              </Text>
            </View>
          )}
        </View>
      )}

      {template.notes && (
        <Text style={styles.cardNotes} numberOfLines={2}>
          "{template.notes}"
        </Text>
      )}

      {isMine && (
        <View style={styles.cardActions}>
          <AnimatedPress
            onPress={onTogglePublic}
            style={styles.actionBtn}
            pressScale={0.95}
          >
            <Globe size={13} color={colors.primary} />
            <Text style={styles.actionLabel}>
              {template.is_public ? 'Tornar privado' : 'Compartilhar'}
            </Text>
          </AnimatedPress>
          <AnimatedPress
            onPress={onDelete}
            style={[styles.actionBtn, styles.actionBtnDanger]}
            pressScale={0.95}
          >
            <Trash2 size={13} color={colors.danger} />
            <Text style={[styles.actionLabel, { color: colors.danger }]}>
              Deletar
            </Text>
          </AnimatedPress>
        </View>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: 4,
    borderRadius: radius.pill,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1 },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  reuseBadge: {
    backgroundColor: colors.primarySofter,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  reuseBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagPublic: {
    backgroundColor: colors.successSoft,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cardNotes: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySofter,
  },
  actionBtnDanger: {
    backgroundColor: colors.dangerSoft,
  },
  actionLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
}), [themeVersion]);
}
