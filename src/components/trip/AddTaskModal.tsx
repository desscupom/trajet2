import {useEffect, useState, useMemo } from 'react';
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
import type { TripMemberWithProfile } from '@/hooks/useTripMembers';
import { getPrefsForCurrentUser } from '@/hooks/useNotificationPreferences';
import { supabase, type Trip } from '@/lib/supabase';
import { scheduleTaskReminder } from '@/lib/taskNotifications';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  trip: Trip;
  members: TripMemberWithProfile[];
  currentUserId: string;
  visible: boolean;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
};

export function AddTaskModal({
  trip,
  members,
  currentUserId,
  visible,
  nextPosition,
  onClose,
  onSaved,
}: Props) {
  const styles = useStyles();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  // null = ninguém atribuído
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);

  function toggleAssignee(id: string) {
    setAssignedToIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  // null = usa default da preferência global do user
  const [reminderOffset, setReminderOffset] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset quando o modal abre
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDescription('');
    setDueDate(null);
    setDueTime(null);
    setAssignedToIds([]);
    setReminderOffset(null);
  }, [visible]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Faltou o título', 'Dê um nome para a tarefa.');
      return;
    }

    setSaving(true);
    const { data: created, error } = await supabase
      .from('tasks')
      .insert({
        trip_id: trip.id,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate,
        due_time: dueTime,
        assigned_to: assignedToIds[0] ?? null,
        
        position: nextPosition,
        reminder_offset_minutes: reminderOffset,
      })
      .select()
      .single();
    setSaving(false);

    if (error) {
      Alert.alert('Erro', error.message);
      return;
    }

    // Agenda lembrete local se a tarefa tem data limite
    if (created && dueDate) {
      const { prefs } = await getPrefsForCurrentUser();
      if (prefs?.notifications_enabled && prefs.task_due_reminder) {
        // Override (por tarefa) tem prioridade sobre default global
        const offset = reminderOffset ?? prefs.task_due_offset_minutes;
        await scheduleTaskReminder(
          created.id,
          created.title,
          dueDate,
          offset,
          dueTime
        );
      }
    }

    onSaved();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
            <View style={styles.headerDragBar} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Nova tarefa</Text>
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
              autoFocus
            />

            <Input
              label="Detalhes (opcional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Notas, link, lembretes..."
              multiline
              numberOfLines={3}
              style={styles.textarea}
            />

            <View style={styles.dateTimeRow}>
              <View style={styles.dateField}>
                <DateField
                  label="Data limite (opcional)"
                  value={dueDate}
                  onChange={setDueDate}
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

            {/* Lembrete: só faz sentido se tem data limite */}
            {dueDate && (
              <ReminderField
                value={reminderOffset}
                onChange={setReminderOffset}
              />
            )}

            <View>
              <Text style={styles.fieldLabel}>Atribuir a (opcional)</Text>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => setAssignedToIds([])}
                  style={[
                    styles.memberChip,
                    assignedToIds.length === 0 && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      assignedToIds.length === 0 && styles.chipTextActive,
                    ]}
                  >
                    Ninguém
                  </Text>
                </Pressable>
                {members.map((m) => {
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
                      style={[
                        styles.memberChip,
                        assignedToIds.includes(m.profile_id) && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          assignedToIds.includes(m.profile_id) && styles.chipTextActive,
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Button
              title="Adicionar tarefa"
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
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
    color: colors.text,
    fontWeight: '600',
  },
  saveBtn: { marginTop: spacing.md },
}), [themeVersion]);
}
