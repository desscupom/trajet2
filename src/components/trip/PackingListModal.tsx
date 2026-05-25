/**
 * PackingListModal — Lista de mala gerada por IA.
 *
 * Gera automaticamente o que levar baseado em:
 * - Destino da viagem
 * - Duração em dias
 * - Clima previsto (se disponível)
 * - Tipo de atividades no roteiro
 *
 * Organiza em categorias com checkboxes para marcar o que já foi colocado.
 * Persiste no AsyncStorage local.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { X } from '@/components/Icon';
import { useAIConsent } from '@/components/AIConsentModal';
import { callOpenAI } from '@/lib/openaiClient';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type PackingItem = {
  id: string;
  label: string;
  category: string;
  checked: boolean;
  emoji: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  destination: string;
  daysCount: number;
  startDate: string | null;
  /** Clima previsto (opcional — melhora sugestões) */
  weatherSummary?: string | null;
  /** Categorias de lugares no roteiro (opcional) */
  placeCategories?: string[];
};

const CATEGORY_ORDER = [
  'documentos', 'dinheiro', 'roupas', 'calçados', 'eletrônicos',
  'higiene', 'medicamentos', 'acessórios', 'extras',
];

const CATEGORY_EMOJI: Record<string, string> = {
  documentos: '📄', dinheiro: '💳', roupas: '👕', calçados: '👟',
  eletrônicos: '🔌', higiene: '🧴', medicamentos: '💊', acessórios: '🎒',
  extras: '✨',
};

export function PackingListModal({
  visible, onClose, tripId, destination, daysCount,
  startDate, weatherSummary, placeCategories = [],
}: Props) {
  const styles = useStyles();
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { requestConsent, consentModal } = useAIConsent();
  const storageKey = `trajet:packing:${tripId}`;

  useEffect(() => {
    if (!visible) return;
    // Carrega lista salva
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          setItems(saved);
          setGenerated(true);
        } catch {}
      }
      // Não gera automaticamente — aguarda confirmação do usuário
    });
  }, [visible]);

  function confirmGenerate() {
    Alert.alert(
      'Gerar checklist com IA',
      'A IA vai criar uma lista personalizada para sua viagem. Os itens gerados também aparecerão no módulo Tarefas, onde você pode marcar e acompanhar o progresso.\n\nDeseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gerar lista', style: 'default', onPress: () => requestConsent(generate) },
      ]
    );
  }

  async function generate() {
    setLoading(true);
    try {
      const weather = weatherSummary ? `Clima previsto: ${weatherSummary}.` : '';
      const activities = placeCategories.length > 0
        ? `Atividades planejadas: ${[...new Set(placeCategories)].join(', ')}.`
        : '';
      const month = startDate
        ? new Date(startDate + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' })
        : '';

      const prompt = `Crie uma lista de mala para viagem a ${destination} por ${daysCount} dias${month ? ` em ${month}` : ''}.
${weather}
${activities}

Retorne APENAS JSON no formato:
{"items": [{"label": "nome do item", "category": "categoria", "emoji": "emoji"}]}

Categorias permitidas: documentos, dinheiro, roupas, calçados, eletrônicos, higiene, medicamentos, acessórios, extras.
Seja específico e prático. Ex: "Passaporte", "Adaptador de tomada tipo I", "Casaco de lã", "Repelente".
Máximo 35 itens. Priorize o essencial.`;

      const raw = await callOpenAI({
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 800,
      });

      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      const generated: PackingItem[] = (parsed.items ?? []).map((it: any, i: number) => ({
        id: `item-${i}`,
        label: it.label ?? '',
        category: it.category ?? 'extras',
        emoji: it.emoji ?? '✓',
        checked: false,
      }));

      setItems(generated);
      setGenerated(true);
      await AsyncStorage.setItem(storageKey, JSON.stringify(generated));
    } catch {
      // Fallback com lista básica
      const fallback = buildFallbackList(destination, daysCount);
      setItems(fallback);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(id: string) {
    const updated = items.map((it) =>
      it.id === id ? { ...it, checked: !it.checked } : it
    );
    setItems(updated);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  }

  async function handleReset() {
    await AsyncStorage.removeItem(storageKey);
    setItems([]);
    setGenerated(false);
    generate();
  }

  // Agrupa por categoria
  const grouped = useMemo(() => {
    const map: Record<string, PackingItem[]> = {};
    for (const item of items) {
      const cat = item.category.toLowerCase();
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    // Ordena categorias
    const sorted = CATEGORY_ORDER.filter((c) => map[c]).map((c) => ({ cat: c, items: map[c] }));
    // Adiciona categorias extras não previstas
    Object.keys(map).forEach((c) => {
      if (!sorted.find((s) => s.cat === c)) sorted.push({ cat: c, items: map[c] });
    });
    return sorted;
  }, [items]);

  const checkedCount = items.filter((i) => i.checked).length;
  const progress = items.length > 0 ? checkedCount / items.length : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>🎒 Lista de mala</Text>
            <Text style={styles.sub}>{destination}</Text>
          </View>
          <View style={styles.headerRight}>
            {generated && !loading && (
              <Pressable onPress={handleReset} hitSlop={8} style={styles.refreshBtn}>
                <Text style={styles.refreshText}>Refazer</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Gerando lista personalizada com IA...</Text>
            <Text style={styles.loadingHint}>Levando em conta destino, clima e atividades</Text>
          </View>
        ) : (
          <>
            {/* Barra de progresso */}
            {items.length > 0 && (
              <View style={styles.progressWrap}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                </View>
                <Text style={styles.progressText}>
                  {checkedCount}/{items.length} itens
                  {progress === 1 ? ' — Mala pronta! ✅' : ''}
                </Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {grouped.map(({ cat, items: catItems }) => (
                <View key={cat} style={styles.category}>
                  <Text style={styles.catTitle}>
                    {CATEGORY_EMOJI[cat] ?? '📦'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                  {catItems.map((item) => (
                    <AnimatedPress
                      key={item.id}
                      onPress={() => toggleItem(item.id)}
                      pressScale={0.98}
                      style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                    >
                      <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                        {item.checked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.itemEmoji}>{item.emoji}</Text>
                      <Text style={[styles.itemLabel, item.checked && styles.itemLabelChecked]}>
                        {item.label}
                      </Text>
                    </AnimatedPress>
                  ))}
                </View>
              ))}

              {items.length === 0 && !loading && (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>🎒</Text>
                  <Text style={styles.emptyTitle}>Checklist de mala</Text>
                  <Text style={styles.emptyText}>
                    A IA vai gerar uma lista personalizada com base no seu destino, duração e atividades planejadas.
                  </Text>
                  <View style={styles.emptyNote}>
                    <Text style={styles.emptyNoteText}>
                      💡 Os itens gerados também aparecem no módulo <Text style={{ fontWeight: '700', color: colors.primary }}>Tarefas</Text> da viagem, onde você pode marcar, priorizar e acompanhar o progresso.
                    </Text>
                  </View>
                  <Button title="Gerar checklist com IA" onPress={confirmGenerate} />
                </View>
              )}
            </ScrollView>
          </>
        )}
      </SafeAreaView>
      {consentModal}
    </Modal>
  );
}

function buildFallbackList(destination: string, days: number): PackingItem[] {
  return [
    { id: '1', label: 'Passaporte / RG', category: 'documentos', emoji: '📄', checked: false },
    { id: '2', label: 'Passagem e reservas impressas', category: 'documentos', emoji: '🎫', checked: false },
    { id: '3', label: 'Seguro viagem', category: 'documentos', emoji: '🛡️', checked: false },
    { id: '4', label: 'Cartão de crédito internacional', category: 'dinheiro', emoji: '💳', checked: false },
    { id: '5', label: `Dinheiro local (${destination})`, category: 'dinheiro', emoji: '💵', checked: false },
    { id: '6', label: `Roupas para ${days} dias`, category: 'roupas', emoji: '👕', checked: false },
    { id: '7', label: 'Tênis confortável', category: 'calçados', emoji: '👟', checked: false },
    { id: '8', label: 'Carregador do celular', category: 'eletrônicos', emoji: '🔌', checked: false },
    { id: '9', label: 'Adaptador de tomada', category: 'eletrônicos', emoji: '🔌', checked: false },
    { id: '10', label: 'Fone de ouvido', category: 'eletrônicos', emoji: '🎧', checked: false },
    { id: '11', label: 'Shampoo e condicionador', category: 'higiene', emoji: '🧴', checked: false },
    { id: '12', label: 'Escova e pasta de dente', category: 'higiene', emoji: '🦷', checked: false },
    { id: '13', label: 'Protetor solar', category: 'higiene', emoji: '☀️', checked: false },
    { id: '14', label: 'Remédio para dor/febre', category: 'medicamentos', emoji: '💊', checked: false },
    { id: '15', label: 'Mochila de mão', category: 'acessórios', emoji: '🎒', checked: false },
  ];
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    sub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    refreshBtn: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
    refreshText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    loadingText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
    loadingHint: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
    progressWrap: {
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    },
    progressBar: {
      flex: 1, height: 6, backgroundColor: colors.surfaceAlt,
      borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
    progressText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500', minWidth: 70 },
    content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
    category: { gap: spacing.xs },
    catTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700', marginBottom: 4 },
    itemRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.surface, borderRadius: radius.md,
      padding: spacing.sm, borderWidth: 1, borderColor: colors.border,
    },
    itemRowChecked: { opacity: 0.55, borderColor: colors.borderSubtle },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2,
      borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
    itemEmoji: { fontSize: 16, width: 22, textAlign: 'center' },
    itemLabel: { flex: 1, color: colors.text, fontSize: fontSize.sm },
    itemLabelChecked: { textDecorationLine: 'line-through', color: colors.textMuted },
    empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
    emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
    emptyNote: {
      backgroundColor: colors.primarySofter,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      padding: spacing.md,
    },
    emptyNoteText: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  }), [themeVersion]);
}
