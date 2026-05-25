/**
 * useTripActivity — registra e busca atividades da viagem
 * para notificar outros membros do grupo.
 */
import { useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

export type ActivityAction =
  | 'added_place'
  | 'removed_place'
  | 'added_expense'
  | 'added_lodging'
  | 'updated_itinerary'
  | 'added_member'
  | 'added_task';

const ACTION_LABELS: Record<ActivityAction, string> = {
  added_place: 'adicionou um local ao roteiro',
  removed_place: 'removeu um local do roteiro',
  added_expense: 'adicionou uma despesa',
  added_lodging: 'adicionou uma hospedagem',
  updated_itinerary: 'atualizou o roteiro',
  added_member: 'entrou na viagem',
  added_task: 'adicionou uma tarefa',
};

export function useTripActivity(tripId: string, currentUserId: string | null) {

  const recordActivity = useCallback(async (
    action: ActivityAction,
    payload: Record<string, any> = {}
  ) => {
    if (!currentUserId || !tripId) return;

    // Registra no banco
    await (supabase as any).from('trip_activity').insert({
      trip_id: tripId,
      user_id: currentUserId,
      action,
      payload,
    }).catch(() => {});

    // Busca nome do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', currentUserId)
      .single();

    const userName = profile?.full_name ?? 'Alguém';
    const label = ACTION_LABELS[action] ?? action;

    // Busca outros membros da viagem para notificar
    const { data: members } = await supabase
      .from('trip_members')
      .select('profile_id')
      .eq('trip_id', tripId)
      .neq('profile_id', currentUserId);

    const { data: owner } = await supabase
      .from('trips')
      .select('owner_id')
      .eq('id', tripId)
      .single();

    const othersIds = [
      ...(members ?? []).map((m: any) => m.profile_id),
      owner?.owner_id,
    ].filter(Boolean).filter((id) => id !== currentUserId);

    if (othersIds.length > 0) {
      // Dispara notificação local para o device do usuário atual
      // (em produção isso seria push notification para os outros)
      // Por ora notifica o próprio usuário que a ação foi registrada
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🗺️ Atualização na viagem',
          body: `${userName} ${label}${payload.name ? `: ${payload.name}` : ''}.`,
          data: { tripId, action, type: 'trip_activity' },
          sound: false,
        },
        trigger: null,
      }).catch(() => {});
    }
  }, [tripId, currentUserId]);

  const markAllSeen = useCallback(async () => {
    if (!currentUserId || !tripId) return;
    // Busca atividades não vistas
    const { data } = await (supabase as any)
      .from('trip_activity')
      .select('id, seen_by')
      .eq('trip_id', tripId)
      .neq('user_id', currentUserId);

    if (!data?.length) return;

    const unseen = data.filter((a: any) => !a.seen_by?.includes(currentUserId));
    await Promise.all(unseen.map((a: any) =>
      (supabase as any).from('trip_activity').update({
        seen_by: [...(a.seen_by ?? []), currentUserId],
      }).eq('id', a.id)
    )).catch(() => {});
  }, [tripId, currentUserId]);

  const getUnseen = useCallback(async (): Promise<number> => {
    if (!currentUserId || !tripId) return 0;
    const { data } = await (supabase as any)
      .from('trip_activity')
      .select('id, seen_by')
      .eq('trip_id', tripId)
      .neq('user_id', currentUserId);

    return (data ?? []).filter((a: any) => !a.seen_by?.includes(currentUserId)).length;
  }, [tripId, currentUserId]);

  return { recordActivity, markAllSeen, getUnseen };
}
