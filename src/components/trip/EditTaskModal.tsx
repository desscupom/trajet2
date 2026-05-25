import { useEffect, useState, useMemo } from 'react';
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
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { ReminderField } from '@/components/ReminderField';
import { TimeField } from '@/components/TimeField';
import { getPrefsForCurrentUser } from '@/hooks/useNotificationPreferences';
import type { TripMemberWithProfile } from '@/hooks/useTripMembers';
import { supabase } from '@/lib/supabase';
import { cancelTaskReminder, scheduleTaskReminder } from '@/lib/taskNotifications';
import { sendPushToTripMembers } from '@/lib/sendPush';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export type EditableTask = {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  reminder_offset_minutes: number | null;
};

type Props = {
  task: EditableTask | null;
  members: TripMemberWithProfile[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function EditTaskModal({
  task,
  members,
  currentUserId,
  onClose,
  onSaved,
}: Props) {
  const styles = useStyles();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [reminderOffset, setReminderOffset] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setDueDate(task.due_date);
    setDueTime(task.due_time);
    const ids = (task as any).assigned_to_ids?.length
      ? (task as any).assigned_to_ids
      : task.assigned_to ? [task.assigned_to] : [];
    setAssignedToIds(ids);
    setReminderOffset(task.reminder_offset_minutes);
  }, [task]);

  function toggleAssignee(profileId: string) {
    setAssignedToIds((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId]
    );
  }

  async function handleSave() {
    if (!task) return;
    if (!title.trim()) {
      Alert.alert('Faltou o título', 'Dê um nome para a tarefa.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('tasks')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate,
        due_time: dueTime,
        assigned_to: assignedToIds[0] ?? null,
        reminder_offset_minutes: reminderOffset,
      })
      .eq('id', task.id);
    setSaving(false);

    if (error) {
      Alert.alert('Erro', error.message);
      return;
    }

    // Atualiza assigned_to_ids (campo array — ignora se campo não existir)
    try {
      await (supabase as any).from('tasks')
        .update({ assigned_to_ids: assignedToIds })
        .eq('id', task.id);
    } catch { /* silencioso */ }

    // Re-agenda lembrete local
    await cancelTaskReminder(task.id);
    if (dueDate) {
      const { prefs } = await getPrefsForCurrentUser();
      if (prefs?.notifications_enabled && prefs.task_due_reminder) {
        const offset = reminderOffset ?? prefs.task_due_offset_minutes;
        await scheduleTaskReminder(task.id, title.trim(), dueDate, offset, dueTime);

        // Também agenda push remoto para o próprio usuário (funciona com app fechado)
        import('@/lib/sendPush').then(({ sendPushToUsers }) => {
          const dateLabel = new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          const timeLabel = dueTime ? ` às ${dueTime.slice(0, 5)}` : '';
          sendPushToUsers({
            profileIds: [currentUserId],
            title: `⏰ Lembrete: ${title.trim()}`,
            body: `Tarefa vence em ${dateLabel}${timeLabel}`,
            data: { type: 'task_reminder', taskId: task.id },
          }).catch(() => {});
        });
      }
    }

    onSaved();
    onClose();

    // Notifica assignees via push quando tarefa tem data
    if (task.trip_id && assignedToIds.length > 0 && dueDate) {
      const dateLabel = new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      const timeLabel = dueTime ? ` às ${dueTime.slice(0, 5)}` : '';
      sendPushToTripMembers({
        tripId: task.trip_id,
        excludeProfileId: currentUserId,
        title: '📋 Tarefa atribuída',
        body: `"${title.trim()}" — vence em ${dateLabel}${timeLabel}`,
        data: { type: 'task_assigned', tripId: task.trip_id, taskId: task.id },
      }).catch(() => {});
    }
  }

  return (
    <Modal
      visible={task !== null}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
            <View style={styles.headerDragBar} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Editar tarefa</Text>
              <Button title="Cancelar" variant="ghost" size="sm" onPress={onClose} />
            </View>
          </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Input
              label="Título"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: comprar passagem aérea"
              autoCapitalize="sentences"
            />

            <Input
              label="Detalhes (opcional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Notas, link, lembretes..."
              multiline
              style={styles.textarea}
            />

            <View style={styles.dateTimeRow}>
              <View style={styles.dateField}>
                <DateField
                  label="Data de entrega"
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Sem data"
                  optional
                />
              </View>
              {dueDate && (
                <View style={styles.timeField}>
                  <TimeField
                    label="Hora"
                    value={dueTime}
                    onChange={setDueTime}
                    optional
                  />
                </View>
              )}
            </View>

            {dueDate && (
              <ReminderField
                value={reminderOffset}
                onChange={setReminderOffset}
              />
            )}

            <View>
              <Text style={styles.fieldLabel}>Atribuir a (opcional)</Text>
              <Text style={styles.fieldHint}>Toque para selecionar um ou mais viajantes</Text>
              <View style={styles.chipRow}>
                {/* Ninguém */}
                <Pressable
                  onPress={() => setAssignedToIds([])}
                  style={[styles.memberChip, assignedToIds.length === 0 && styles.chipActive]}
                >
                  <Text style={[styles.chipText, assignedToIds.length === 0 && styles.chipTextActive]}>
                    Ninguém
                  </Text>
                </Pressable>
                {/* Todos */}
                <Pressable
                  onPress={() => setAssignedToIds(members.map((m) => m.profile_id))}
                  style={[styles.memberChip, assignedToIds.length === members.length && members.length > 0 && styles.chipActive]}
                >
                  <Text style={[styles.chipText, assignedToIds.length === members.length && members.length > 0 && styles.chipTextActive]}>
                    Todos
                  </Text>
                </Pressable>
                {/* Membros individuais */}
                {members.map((m) => {
                  const active = assignedToIds.includes(m.profile_id);
                  const name =
                    m.profile_id === currentUserId
                      ? 'Você'
                      : m.profile?.full_name?.split(' ')[0] ||
                        m.profile?.email?.split('@')[0] ||
                        '?';
                  return (
                    <Pressable
                      key={m.profile_id}
                      onPress={() => toggleAssignee(m.profile_id)}
                      style={[styles.memberChip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {active ? '✓ ' : ''}{name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Button
              title="Salvar mudanças"
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
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
    textarea: {
      minHeight: 80,
      textAlignVertical: 'top',
      paddingTop: spacing.md,
    },
    dateTimeRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    dateField: { flex: 2 },
    timeField: { flex: 1, minWidth: 110 },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '500',
      marginBottom: spacing.xs,
    },
    fieldHint: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      marginBottom: spacing.sm,
      opacity: 0.7,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
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
    chipText: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      fontWeight: '500',
    },
    chipTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    saveBtn: { marginTop: spacing.md },
  }), [themeVersion]);
}
