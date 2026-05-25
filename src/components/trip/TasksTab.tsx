import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { AnimatedCheckbox } from '@/components/AnimatedCheckbox';
import { AnimatedPress } from '@/components/AnimatedPress';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListChecks,
  Plus,
  User,
  X,
} from '@/components/Icon';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useTripMembers, type TripMemberWithProfile } from '@/hooks/useTripMembers';
import { formatDateBR, toDbDate } from '@/lib/dates';
import { getStaggerDelay } from '@/lib/stagger';
import { getPrefsForCurrentUser } from '@/hooks/useNotificationPreferences';
import { cancelTaskReminder, scheduleTaskReminder } from '@/lib/taskNotifications';
import { supabase, type Trip } from '@/lib/supabase';
import { supabaseQueued } from '@/lib/supabaseQueued';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

import { ActionSheet } from '@/components/ActionSheet';
import { AddTaskModal } from './AddTaskModal';
import { EditTaskModal, type EditableTask } from './EditTaskModal';
import { useTheme } from '@/components/ThemeProvider';

let DraggableFlatList: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DraggableFlatList = require('react-native-draggable-flatlist').default;
}

type Task = {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  done: boolean;
  assigned_to: string | null;
  assigned_to_ids: string[] | null;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  reminder_offset_minutes: number | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  category: string | null;
};

export function TasksTab({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const { user } = useAuth();
  const toast = useToast();
  const { members } = useTripMembers(trip.id);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [sortBy, setSortBy] = useState<'position' | 'priority' | 'due_date' | 'assignee'>('position');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [taskMenuOpen, setTaskMenuOpen] = useState<Task | null>(null);
  const [showSortFilter, setShowSortFilter] = useState(false);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('trip_id', trip.id)
      .order('done')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    setTasks((data ?? []) as unknown as Task[]);
    setLoading(false);
  }, [trip.id]);

  const refreshProps = usePullToRefresh(fetchTasks);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks])
  );

  useRealtimeTable({
    table: 'tasks',
    filter: `trip_id=eq.${trip.id}`,
    onChange: fetchTasks,
  });

  const { pending, completed } = useMemo(() => {
    const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

    let p: Task[] = [];
    const c: Task[] = [];
    for (const t of tasks) {
      (t.done ? c : p).push(t);
    }

    // Filtra pendentes
    if (filterPriority) p = p.filter((t) => t.priority === filterPriority);
    if (filterAssignee) {
      p = p.filter((t) => {
        const ids = t.assigned_to_ids?.length ? t.assigned_to_ids : t.assigned_to ? [t.assigned_to] : [];
        return ids.includes(filterAssignee);
      });
    }

    // Ordena pendentes
    p.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return (PRIORITY_ORDER[a.priority ?? 'normal'] ?? 2) - (PRIORITY_ORDER[b.priority ?? 'normal'] ?? 2);
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        case 'assignee': {
          const aId = a.assigned_to_ids?.[0] ?? a.assigned_to ?? '';
          const bId = b.assigned_to_ids?.[0] ?? b.assigned_to ?? '';
          return aId.localeCompare(bId);
        }
        default:
          return a.position - b.position;
      }
    });

    c.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    return { pending: p, completed: c };
  }, [tasks, sortBy, filterPriority, filterAssignee]);

  const [pendingLocal, setPendingLocal] = useState<Task[]>([]);
  useEffect(() => {
    setPendingLocal(pending);
  }, [pending]);

  async function persistOrder(newOrder: Task[]) {
    const updates = newOrder.map((t, idx) =>
      supabase.from('tasks').update({ position: idx }).eq('id', t.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      console.warn('Erro ao reordenar tarefas:', firstError.error.message);
      fetchTasks();
    }
  }

  async function moveByOffset(taskId: string, offset: number) {
    const idx = pendingLocal.findIndex((t) => t.id === taskId);
    const newIdx = idx + offset;
    if (idx === -1 || newIdx < 0 || newIdx >= pendingLocal.length) return;
    const next = [...pendingLocal];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setPendingLocal(next);
    persistOrder(next);
  }

  async function toggleTask(task: Task) {
    const newDone = !task.done;

    // Atualização optimista imediata
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: newDone } : t))
    );

    const { error, queued } = await supabaseQueued
      .from('tasks')
      .update({ done: newDone })
      .eq('id', task.id)
      .run();

    if (error) {
      // Reverte se falhou
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t))
      );
      toast.error(error.message);
      return;
    }
    if (queued) {
      toast.info('Salvo localmente. Vai sincronizar quando voltar online.');
    }

    if (newDone) {
      await cancelTaskReminder(task.id);
    } else if (task.due_date) {
      const { prefs } = await getPrefsForCurrentUser();
      if (prefs?.notifications_enabled && prefs.task_due_reminder) {
        await scheduleTaskReminder(
          task.id,
          task.title,
          task.due_date,
          prefs.task_due_offset_minutes
        );
      }
    }
  }

  async function deleteTask(task: Task) {
    Alert.alert('Remover tarefa?', `"${task.title}" será apagada.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          // Remove do state imediatamente — sem esperar o banco
          setTasks((prev) => prev.filter((t) => t.id !== task.id));

          const { error, queued } = await supabaseQueued
            .from('tasks')
            .delete()
            .eq('id', task.id)
            .run();

          if (error) {
            // Reverte se falhou
            setTasks((prev) => {
              const restored = [...prev, task];
              return restored.sort((a, b) => a.position - b.position);
            });
            toast.error(error.message);
            return;
          }

          await cancelTaskReminder(task.id);

          if (queued) {
            toast.info('Removida localmente. Sincroniza quando voltar online.');
          } else {
            toast.success('Tarefa removida.');
          }
        },
      },
    ]);
  }

  function openEdit(task: Task) {
    setEditingTask({
      id: task.id,
      trip_id: task.trip_id,
      title: task.title,
      description: task.description,
      due_date: task.due_date,
      due_time: task.due_time,
      assigned_to: task.assigned_to,
      reminder_offset_minutes: task.reminder_offset_minutes,
    });
  }

  if (loading) {
    return (
      <View style={styles.list}>
        <Skeleton height={48} borderRadius={radius.md} />
        <View style={{ height: spacing.md }} />
        <Skeleton height={56} borderRadius={radius.md} />
        <View style={{ height: spacing.sm }} />
        <Skeleton height={56} borderRadius={radius.md} />
        <View style={{ height: spacing.sm }} />
        <Skeleton height={56} borderRadius={radius.md} />
      </View>
    );
  }

  // Dados da aba ativa
  const activeList = activeTab === 'pending' ? pendingLocal : completed;

  const hasFilter = !!filterPriority || !!filterAssignee;
  const filterCount = (filterPriority ? 1 : 0) + (filterAssignee ? 1 : 0);

  const SORT_LABELS: Record<string, string> = {
    position: 'Ordem manual', priority: 'Prioridade',
    due_date: 'Data de venc.', assignee: 'Responsável',
  };

  const headerComponent = (
    <View style={styles.headerSection}>
      {/* Botão adicionar + filtro */}
      <View style={styles.headerTopRow}>
        <Button
          title="+ Tarefa"
          variant="secondary"
          leftIcon={<Plus size={16} color={colors.text} />}
          onPress={() => setAddOpen(true)}
          style={{ flex: 1 }}
        />
        <Pressable
          onPress={() => setShowSortFilter((v) => !v)}
          style={[styles.filterToggleBtn, (hasFilter || sortBy !== 'position') && styles.filterToggleBtnActive]}
        >
          <Text style={[styles.filterToggleText, (hasFilter || sortBy !== 'position') && styles.filterToggleTextActive]}>
            {sortBy !== 'position' ? SORT_LABELS[sortBy].split(' ')[0] : 'Filtrar'}
            {filterCount > 0 ? ` · ${filterCount}` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Painel de ordenação e filtro */}
      {showSortFilter && (
        <View style={styles.sortFilterPanel}>
          <Text style={styles.sortFilterLabel}>Ordenar por</Text>
          <View style={styles.sortRow}>
            {(['position', 'priority', 'due_date', 'assignee'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSortBy(s)}
                style={[styles.sortChip, sortBy === s && styles.sortChipActive]}
              >
                <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
                  {SORT_LABELS[s]}
                </Text>
              </Pressable>
            ))}
          </View>

          {members.length > 1 && (
            <>
              <Text style={[styles.sortFilterLabel, { marginTop: 10 }]}>Filtrar por responsável</Text>
              <View style={styles.sortRow}>
                <Pressable
                  onPress={() => setFilterAssignee(null)}
                  style={[styles.sortChip, !filterAssignee && styles.sortChipActive]}
                >
                  <Text style={[styles.sortChipText, !filterAssignee && styles.sortChipTextActive]}>Todos</Text>
                </Pressable>
                {members.map((m) => {
                  const name = m.profile?.full_name?.split(' ')[0] ?? m.profile?.email?.split('@')[0] ?? '?';
                  return (
                    <Pressable
                      key={m.profile_id}
                      onPress={() => setFilterAssignee(filterAssignee === m.profile_id ? null : m.profile_id)}
                      style={[styles.sortChip, filterAssignee === m.profile_id && styles.sortChipActive]}
                    >
                      <Text style={[styles.sortChipText, filterAssignee === m.profile_id && styles.sortChipTextActive]}>
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={[styles.sortFilterLabel, { marginTop: 10 }]}>Filtrar por prioridade</Text>
          <View style={styles.sortRow}>
            {[null, 'urgent', 'high', 'normal', 'low'].map((p) => {
              const LABELS: Record<string, string> = { urgent: '🔴 Urgente', high: '🟠 Alta', normal: '🟡 Normal', low: '🟢 Baixa' };
              return (
                <Pressable
                  key={String(p)}
                  onPress={() => setFilterPriority(filterPriority === p ? null : p)}
                  style={[styles.sortChip, filterPriority === p && styles.sortChipActive]}
                >
                  <Text style={[styles.sortChipText, filterPriority === p && styles.sortChipTextActive]}>
                    {p === null ? 'Todas' : LABELS[p]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Abas Pendentes / Concluídas */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab('pending')}
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}>
            Pendentes
          </Text>
          {pendingLocal.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'pending' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'pending' && styles.tabBadgeTextActive]}>
                {pendingLocal.length}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('done')}
          style={[styles.tabBtn, activeTab === 'done' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabBtnText, activeTab === 'done' && styles.tabBtnTextActive]}>
            Concluídas
          </Text>
          {completed.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'done' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'done' && styles.tabBadgeTextActive]}>
                {completed.length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );

  const footerComponent = null;

  const emptyComponent =
    activeList.length === 0 ? (
      <EmptyState
        icon={<ListChecks size={36} color={colors.primary} />}
        title={activeTab === 'pending' ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa concluída'}
        description={activeTab === 'pending'
          ? 'Anote o que precisa resolver antes e durante a viagem.'
          : 'As tarefas marcadas como feitas aparecerão aqui.'}
        action={activeTab === 'pending' ? {
          label: 'Adicionar tarefa',
          onPress: () => setAddOpen(true),
        } : undefined}
      />
    ) : null;

  return (
    <>
      {Platform.OS === 'web' ? (
        <FlatList
          data={activeList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl {...refreshProps} />}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={footerComponent}
          renderItem={({ item, index }) => (
            <FadeInView delay={getStaggerDelay(index, 40, 240)}>
              <TaskRow
                task={item}
                members={members}
                currentUserId={user?.id}
                onToggle={() => toggleTask(item)}
                onDelete={() => deleteTask(item)}
                onEdit={() => openEdit(item)}
                onLongPress={() => setTaskMenuOpen(item)}
                webControls={{
                  canMoveUp: index > 0,
                  canMoveDown: index < pendingLocal.length - 1,
                  onMoveUp: () => moveByOffset(item.id, -1),
                  onMoveDown: () => moveByOffset(item.id, 1),
                }}
              />
            </FadeInView>
          )}
        />
      ) : (
        <DraggableFlatList
          data={activeList}
          keyExtractor={(item: Task) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl {...refreshProps} />}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={footerComponent}
          activationDistance={activeTab === 'pending' ? 10 : 9999}
          onDragEnd={({ data }: { data: Task[] }) => {
            setPendingLocal(data);
            persistOrder(data);
          }}
          renderItem={({
            item,
            drag,
            isActive,
          }: {
            item: Task;
            drag: () => void;
            isActive: boolean;
          }) => (
            <TaskRow
              task={item}
              members={members}
              currentUserId={user?.id}
              onToggle={() => toggleTask(item)}
              onDelete={() => deleteTask(item)}
              onEdit={() => openEdit(item)}
              onLongPress={() => setTaskMenuOpen(item)}
              mobileDrag={{ onLongPress: () => setTaskMenuOpen(item), isActive }}
            />
          )}
        />
      )}

      {/* Menu de opções da tarefa (long press) */}
      <ActionSheet
        visible={!!taskMenuOpen}
        title={taskMenuOpen?.title ?? ''}
        onClose={() => setTaskMenuOpen(null)}
        options={[
          {
            icon: '✏️',
            label: 'Editar tarefa',
            onPress: () => { setTaskMenuOpen(null); if (taskMenuOpen) openEdit(taskMenuOpen); },
          },
          {
            icon: taskMenuOpen?.done ? '↩️' : '✅',
            label: taskMenuOpen?.done ? 'Marcar como pendente' : 'Marcar como concluída',
            onPress: () => { if (taskMenuOpen) { toggleTask(taskMenuOpen); } setTaskMenuOpen(null); },
          },
          {
            icon: '🗑️',
            label: 'Excluir tarefa',
            destructive: true,
            onPress: () => { setTaskMenuOpen(null); if (taskMenuOpen) deleteTask(taskMenuOpen); },
          },
        ]}
      />

      <AddTaskModal
        trip={trip}
        members={members}
        currentUserId={user?.id ?? ''}
        visible={addOpen}
        nextPosition={pendingLocal.length}
        onClose={() => setAddOpen(false)}
        onSaved={fetchTasks}
      />

      <EditTaskModal
        task={editingTask}
        members={members}
        currentUserId={user?.id ?? ''}
        onClose={() => setEditingTask(null)}
        onSaved={fetchTasks}
      />
    </>
  );
}

type MobileDragProps = {
  onLongPress: () => void;
  isActive: boolean;
};

type WebControls = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

function TaskRow({
  task,
  members,
  currentUserId,
  onToggle,
  onDelete,
  onEdit,
  onLongPress,
  mobileDrag,
  webControls,
}: {
  task: Task;
  members: TripMemberWithProfile[];
  currentUserId?: string;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onLongPress?: () => void;
  mobileDrag?: MobileDragProps;
  webControls?: WebControls;
}) {
  const styles = useStyles();

  // Assignees
  const assignedIds = task.assigned_to_ids?.length
    ? task.assigned_to_ids
    : task.assigned_to ? [task.assigned_to] : [];
  const assigneeNames = assignedIds.map((id) => {
    if (id === currentUserId) return 'Você';
    const m = members.find((m) => m.profile_id === id);
    return m?.profile?.full_name?.split(' ')[0] || m?.profile?.email?.split('@')[0] || '?';
  });
  const assigneeLabel =
    assigneeNames.length === 0 ? null
    : assigneeNames.length === 1 ? assigneeNames[0]
    : assigneeNames.length === members.length && members.length > 1 ? 'Todos'
    : assigneeNames.slice(0, 2).join(', ') + (assigneeNames.length > 2 ? ` +${assigneeNames.length - 2}` : '');

  // Prioridade
  const priorityDot: Record<string, string> = {
    urgent: '🔴',
    high:   '🟠',
    normal: '🟡',
    low:    '🟢',
  };
  const priorityEmoji = task.priority ? (priorityDot[task.priority] ?? null) : null;

  // Status de prazo
  const today = toDbDate(new Date());
  const isOverdue = !task.done && task.due_date !== null && task.due_date < today;
  const isDueToday = !task.done && task.due_date === today;
  const isDueSoon = !task.done && task.due_date !== null && task.due_date > today && (() => {
    const diff = Math.round((new Date(task.due_date).getTime() - Date.now()) / 86400000);
    return diff <= 2;
  })();

  const RowComp: any = mobileDrag ? Pressable : AnimatedPress;

  return (
    <RowComp
      onPress={onEdit}
      onLongPress={onLongPress ?? mobileDrag?.onLongPress}
      delayLongPress={250}
      pressScale={0.99}
      style={[
        styles.row,
        task.done && styles.rowDone,
        mobileDrag?.isActive && styles.rowActive,
        isOverdue && styles.rowOverdue,
      ]}
    >
      {mobileDrag && !task.done && (
        <View style={styles.dragHandle}>
          <GripVertical size={14} color={colors.textMuted} />
        </View>
      )}

      <AnimatedCheckbox
        checked={task.done}
        onPress={onToggle}
      />

      <View style={styles.rowContent}>
        <View style={styles.titleRow}>
          {priorityEmoji && !task.done && (
            <Text style={styles.priorityEmoji}>{priorityEmoji}</Text>
          )}
          <Text
            style={[styles.title, task.done && styles.titleDone]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
        </View>

        {!!task.description && !task.done && (
          <Text style={styles.description} numberOfLines={2}>
            {task.description}
          </Text>
        )}

        {(task.due_date || assigneeLabel || task.category) && (
          <View style={styles.metaRow}>
            {task.due_date && (
              <View
                style={[
                  styles.metaPill,
                  isOverdue && styles.metaPillOverdue,
                  isDueToday && styles.metaPillToday,
                  isDueSoon && !isOverdue && !isDueToday && styles.metaPillSoon,
                ]}
              >
                <Calendar
                  size={11}
                  color={isOverdue ? colors.danger : isDueToday ? colors.warning : colors.textMuted}
                />
                <Text
                  style={[
                    styles.metaText,
                    isOverdue && styles.metaTextOverdue,
                    isDueToday && styles.metaTextToday,
                  ]}
                >
                  {isOverdue ? '⚠️ ' : isDueToday ? '🔔 Hoje · ' : ''}
                  {formatDateBR(task.due_date)}
                  {task.due_time && ` · ${task.due_time.slice(0, 5)}`}
                </Text>
              </View>
            )}

            {assigneeLabel && (
              <View style={styles.metaPill}>
                <User size={11} color={colors.textMuted} />
                <Text style={styles.metaText}>{assigneeLabel}</Text>
              </View>
            )}

            {task.category && !task.done && (
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{task.category}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {webControls && !task.done && (
        <View style={styles.webControls}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); webControls.onMoveUp(); }}
            disabled={!webControls.canMoveUp}
            hitSlop={6}
            style={[styles.arrowBtn, !webControls.canMoveUp && styles.arrowDisabled]}
          >
            <ChevronUp size={14} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); webControls.onMoveDown(); }}
            disabled={!webControls.canMoveDown}
            hitSlop={6}
            style={[styles.arrowBtn, !webControls.canMoveDown && styles.arrowDisabled]}
          >
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
        hitSlop={8}
        style={styles.removeBtn}
      >
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </RowComp>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
    list: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    headerSection: {
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    footerSection: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowDone: {
      opacity: 0.45,
    },
    rowOverdue: {
      borderColor: colors.danger + '50',
      backgroundColor: colors.dangerSoft,
    },
    rowActive: {
      opacity: 0.85,
      transform: [{ scale: 1.02 }],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
    dragHandle: {
      width: 14,
      paddingTop: 4,
      alignItems: 'center',
    },
    rowContent: { flex: 1, gap: spacing.xs },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 5,
    },
    priorityEmoji: {
      fontSize: 12,
      marginTop: 3,
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.md,
      fontWeight: '500',
      lineHeight: 22,
    },
    titleDone: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    description: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: 2,
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    metaPillOverdue: { backgroundColor: colors.dangerSoft },
    metaPillToday: { backgroundColor: colors.warningSoft, borderColor: colors.warning + '40', borderWidth: 1 },
    metaPillSoon: { backgroundColor: colors.primarySoft },
    metaTextOverdue: { color: colors.danger, fontWeight: '700' },
    metaTextToday: { color: colors.warning, fontWeight: '700' },
    metaText: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '500',
    },
    webControls: { flexDirection: 'column', gap: 2 },
    arrowBtn: {
      width: 22,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 4,
      backgroundColor: colors.bg,
    },
    arrowDisabled: { opacity: 0.3 },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 3,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
    },
    tabBtnActive: { backgroundColor: colors.primarySoft },
    tabBtnText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
    tabBtnTextActive: { color: colors.primary, fontWeight: '700' },
    tabBadge: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    tabBadgeActive: { backgroundColor: colors.primary },
    tabBadgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    tabBadgeTextActive: { color: '#fff' },
  headerTopRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterToggleBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterToggleText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  filterToggleTextActive: {
    color: colors.primary,
  },
  sortFilterPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortFilterLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sortChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  sortChipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  }), [themeVersion]);
}
