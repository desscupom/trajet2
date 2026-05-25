import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { generateTravelChecklist, type SuggestedTask } from '@/lib/itineraryAI';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, letterSpacing, radius, spacing } from '@/lib/theme';

const PRIORITY_CONFIG = {
  alta: { label: 'Alta', color: colors.danger, bg: colors.dangerSoft },
  media: { label: 'Média', color: colors.warning, bg: colors.warningSoft },
  baixa: { label: 'Baixa', color: colors.textMuted, bg: colors.surfaceAlt },
};

const CATEGORY_EMOJI: Record<string, string> = {
  documento: '🛂',
  saude: '💊',
  financeiro: '💳',
  compras: '🛍️',
  logistica: '📦',
};

type Props = {
  visible: boolean;
  tripId: string;
  destination: string;
  startDate: string | null;
  daysCount: number;
  onFinish: () => void;
};

export function TravelChecklistModal({
  visible, tripId, destination, startDate, daysCount, onFinish,
}: Props) {
  const toast = useToast();
  const [tasks, setTasks] = useState<SuggestedTask[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (visible && !generated && !loading) {
      generate();
    }
  }, [visible]);

  async function generate() {
    setLoading(true);
    try {
      const result = await generateTravelChecklist(destination, startDate, daysCount);
      setTasks(result);
      // Pré-seleciona tudo de prioridade alta
      const preSelected = new Set<number>();
      result.forEach((t, i) => { if (t.priority === 'alta') preSelected.add(i); });
      setSelected(preSelected);
      setGenerated(true);
    } catch {
      toast.error('Não foi possível gerar o checklist. Você pode adicionar tarefas depois.');
      onFinish();
    } finally {
      setLoading(false);
    }
  }

  function toggleTask(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(tasks.map((_, i) => i)));
  }
  function deselectAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    const toInsert = tasks
      .filter((_, i) => selected.has(i))
      .map((t) => ({
        trip_id: tripId,
        title: `${t.emoji} ${t.title}`,
        done: false,
      }));

    if (toInsert.length === 0) {
      onFinish();
      return;
    }

    setSaving(true);
    await supabase.from('tasks').insert(toInsert);
    setSaving(false);
    toast.success(`${toInsert.length} tarefas adicionadas! ✅`);
    onFinish();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFinish}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerEmoji}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Checklist para {destination}</Text>
            <Text style={s.headerSub}>Selecione o que quer acompanhar</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loadingText}>A IA está criando seu checklist personalizado...</Text>
          </View>
        ) : (
          <>
            {/* Seleção rápida */}
            <View style={s.selectRow}>
              <Pressable onPress={selectAll} style={s.selectBtn}>
                <Text style={s.selectBtnText}>Selecionar todas</Text>
              </Pressable>
              <Text style={s.selectCount}>{selected.size}/{tasks.length} selecionadas</Text>
              <Pressable onPress={deselectAll} style={s.selectBtn}>
                <Text style={s.selectBtnText}>Desmarcar todas</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {tasks.map((task, i) => {
                const active = selected.has(i);
                const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.baixa;
                return (
                  <AnimatedPress
                    key={i}
                    onPress={() => toggleTask(i)}
                    style={[s.taskCard, active && s.taskCardActive]}
                    pressScale={0.98}
                  >
                    {/* Checkbox */}
                    <View style={[s.check, active && s.checkActive]}>
                      {active && <Text style={s.checkMark}>✓</Text>}
                    </View>

                    {/* Conteúdo */}
                    <View style={s.taskBody}>
                      <Text style={[s.taskTitle, !active && s.taskTitleInactive]}>
                        {task.emoji} {task.title}
                      </Text>
                    </View>

                    {/* Badge de prioridade */}
                    <View style={[s.priorityBadge, { backgroundColor: pCfg.bg }]}>
                      <Text style={[s.priorityText, { color: pCfg.color }]}>
                        {pCfg.label}
                      </Text>
                    </View>
                  </AnimatedPress>
                );
              })}
            </ScrollView>

            <View style={s.footer}>
              <Button
                title={saving ? 'Salvando...' : `Adicionar ${selected.size} tarefa${selected.size !== 1 ? 's' : ''}`}
                variant="primary"
                onPress={handleSave}
                fullWidth
                loading={saving}
              />
              <Pressable onPress={onFinish} style={s.skipBtn}>
                <Text style={s.skipText}>Pular por agora</Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEmoji: { fontSize: 32 },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  loadingText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 22 },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  selectBtn: { padding: spacing.xs },
  selectBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
  selectCount: { color: colors.textMuted, fontSize: fontSize.xs },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  taskCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySofter,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  taskBody: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  taskTitleInactive: { color: colors.textMuted },
  priorityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  priorityText: { fontSize: 10, fontWeight: '700', letterSpacing: letterSpacing.wide },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipBtn: { alignItems: 'center', padding: spacing.sm },
  skipText: { color: colors.textMuted, fontSize: fontSize.sm },
});
