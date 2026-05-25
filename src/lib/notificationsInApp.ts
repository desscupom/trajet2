import { supabase } from '@/lib/supabase';

/**
 * Lib de notificações in-app.
 *
 * Diferente de push notifications (expo-notifications):
 * - Estas são PERSISTENTES no Supabase
 * - Sobrevivem a relaunch do app
 * - Aparecem na lista da tela /notifications
 * - Geram badge (count de não-lidas)
 *
 * Geração:
 * - Por triggers do servidor (alguém adiciona despesa → notif pros membros)
 * - Por ações locais (ex: criar lembrete personalizado)
 *
 * No futuro pode integrar com expo-notifications pra também disparar push,
 * mas as duas coisas são independentes.
 */

export type NotificationType =
  | 'trip_starting'
  | 'lodging_checkin'
  | 'task_due'
  | 'expense_added'
  | 'member_joined'
  | 'trip_edit'
  | 'public_share_viewed'
  | 'other';

export type InAppNotification = {
  id: string;
  profile_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Estrutura livre — tipicamente { trip_id, ... } */
  data: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Lista notificações do user logado, mais recentes primeiro.
 */
export async function listNotifications(
  limit = 50,
): Promise<InAppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as InAppNotification[];
}

/**
 * Conta notificações não lidas (pra badge).
 * Rápido — usa o índice parcial em (profile_id, created_at desc) where read_at is null.
 */
export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) {
    console.warn('Erro contando unread:', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Marca uma notificação como lida.
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

/**
 * Marca TODAS as notificações do user como lidas.
 */
export async function markAllAsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

/**
 * Deleta uma notificação específica.
 */
export async function deleteNotification(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);
  if (error) throw new Error(error.message);
}

/**
 * Cria uma notificação local pro próprio user (útil pra ações offline ou testes).
 */
export async function createLocalNotification(input: {
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Não autenticado');

  const { error } = await supabase.from('notifications').insert({
    profile_id: userData.user.id,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    data: input.data ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Helper pra formatar "há X minutos / horas / dias".
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `há ${diffDays} dia${diffDays === 1 ? '' : 's'}`;

  return date.toLocaleDateString('pt-BR');
}
