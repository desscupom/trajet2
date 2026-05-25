import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  cancelScheduledNotification,
  scheduleLocalNotification,
} from '@/lib/notifications';

const STORAGE_KEY = 'trajet:task_notifications';

type Mapping = Record<string, string>; // taskId -> notificationId

async function readMapping(): Promise<Mapping> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeMapping(map: Mapping): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * Agenda lembrete pra uma tarefa.
 * Se já houver notificação pra essa task, cancela a antiga primeiro.
 *
 * @param dueDate string YYYY-MM-DD — vem do banco (campo due_date)
 * @param dueTime string HH:MM:SS opcional — quando preenchido, lembrete usa
 *                a hora real da tarefa. Quando null, usa 9h da manhã.
 * @param offsetMinutes quantos minutos antes do horário disparar
 *                      (default 1440 = 1 dia antes)
 */
export async function scheduleTaskReminder(
  taskId: string,
  taskTitle: string,
  dueDate: string,
  offsetMinutes: number,
  dueTime?: string | null
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancela qualquer agendamento anterior dessa task
  await cancelTaskReminder(taskId);

  // Parse YYYY-MM-DD
  const [yearStr, monthStr, dayStr] = (dueDate ?? '').split('-');
  // Hora: se veio dueTime no formato HH:MM:SS ou HH:MM, usa. Senão, 9h.
  let hour = 9;
  let minute = 0;
  if (dueTime) {
    const parts = (dueTime ?? '00:00').split(':');
    hour = Number(parts[0]) || 9;
    minute = Number(parts[1]) || 0;
  }

  const dueAt = new Date(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    hour,
    minute,
    0
  );

  const triggerAt = new Date(dueAt.getTime() - offsetMinutes * 60 * 1000);

  // Se ficar no passado, não agenda
  if (triggerAt.getTime() <= Date.now()) return;

  const notifId = await scheduleLocalNotification({
    title: 'Lembrete de tarefa',
    body: taskTitle,
    triggerAt,
    data: { type: 'task_due', taskId },
  });

  if (notifId) {
    const map = await readMapping();
    map[taskId] = notifId;
    await writeMapping(map);
  }
}

/** Cancela o lembrete agendado pra uma tarefa, se houver. */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const map = await readMapping();
  const notifId = map[taskId];
  if (notifId) {
    await cancelScheduledNotification(notifId);
    delete map[taskId];
    await writeMapping(map);
  }
}
