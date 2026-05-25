import { supabase } from '@/lib/supabase';

/**
 * Lembretes customizados pelo user.
 *
 * Diferente de:
 * - notifications (sistema interno do app — gerado por triggers)
 * - notification_preferences (configurações on/off por tipo)
 *
 * Aqui o user cria um reminder com texto livre + horário específico.
 * Quando chega `remind_at`, o cron `_dispatch_user_reminders` converte
 * em notification (que vira push se webhook estiver ativo).
 */

export type UserReminder = {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  remind_at: string; // ISO timestamp
  trip_id: string | null;
  notified_at: string | null;
  created_at: string;
};

export type CreateReminderInput = {
  title: string;
  body?: string;
  remindAt: Date;
  tripId?: string | null;
};

/**
 * Lista reminders do user logado, mais próximo da data primeiro pra pendentes.
 */
export async function listReminders(): Promise<UserReminder[]> {
  // Pega tanto pendentes quanto já notificados (histórico)
  const { data, error } = await supabase
    .from('user_reminders')
    .select('*')
    .order('remind_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserReminder[];
}

export async function createReminder(input: CreateReminderInput): Promise<UserReminder> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('user_reminders')
    .insert({
      profile_id: userData.user.id,
      title: input.title,
      body: input.body ?? null,
      remind_at: input.remindAt.toISOString(),
      trip_id: input.tripId ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Erro');
  return data as UserReminder;
}

export async function updateReminder(
  id: string,
  patch: Partial<CreateReminderInput>,
): Promise<void> {
  const update: {
    title?: string;
    body?: string | null;
    remind_at?: string;
    notified_at?: string | null;
    trip_id?: string | null;
  } = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body ?? null;
  if (patch.remindAt !== undefined) {
    update.remind_at = patch.remindAt.toISOString();
    // Se mudou a data, reseta notified_at pra disparar de novo
    update.notified_at = null;
  }
  if (patch.tripId !== undefined) update.trip_id = patch.tripId;

  const { error } = await supabase
    .from('user_reminders')
    .update(update)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_reminders')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Status legível de um reminder.
 */
export function getReminderStatus(
  reminder: UserReminder,
): 'pending' | 'sent' | 'overdue' {
  if (reminder.notified_at) return 'sent';
  const remindAt = new Date(reminder.remind_at);
  // Overdue: deveria ter disparado mas ainda não foi processado pelo cron
  // (rara — cron roda a cada minuto. Vê só nos primeiros segundos após remind_at)
  if (remindAt < new Date()) return 'overdue';
  return 'pending';
}

/**
 * Formato amigável: "amanhã às 14:00", "em 3 dias", "há 2 horas"...
 */
export function formatReminderTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffMinutes = Math.round(diffMs / 60_000);
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Já passou
  if (diffMinutes < 0) {
    const absMin = Math.abs(diffMinutes);
    if (absMin < 60) return `há ${absMin} min`;
    const absHours = Math.round(absMin / 60);
    if (absHours < 24) return `há ${absHours}h`;
    const absDays = Math.round(absHours / 24);
    return `há ${absDays} ${absDays === 1 ? 'dia' : 'dias'}`;
  }

  // Futuro
  if (diffMinutes < 60) return `em ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return `hoje às ${time}`;
    }
    return `em ${diffHours}h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return `amanhã às ${time}`;
  if (diffDays < 7) return `em ${diffDays} dias`;

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

import * as Notifications from 'expo-notifications';

/**
 * Agenda notificação local para o reminder.
 * Chamado logo após createReminder para garantir que o usuário receba.
 */
export async function scheduleLocalReminder(reminder: UserReminder): Promise<void> {
  const remindAt = new Date(reminder.remind_at);
  const now = new Date();
  if (remindAt <= now) return; // já passou

  const secondsFromNow = Math.floor((remindAt.getTime() - now.getTime()) / 1000);
  if (secondsFromNow < 5) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔔 ${reminder.title}`,
        body: reminder.body ?? 'Lembrete do Trajet',
        sound: true,
        data: { reminderId: reminder.id, type: 'user_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        repeats: false,
      },
    });
  } catch (err) {
    console.warn('[userReminders] erro ao agendar notificação local:', err);
  }
}
