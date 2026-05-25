import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/** Retorna contagem de notificações não lidas por trip_id */
export function useUnreadNotifications(tripId?: string) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    async function fetch() {
      let q = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user!.id)
        .is('read_at', null);

      if (tripId) {
        q = q.eq('data->>tripId', tripId);
      }

      const { count: c } = await q;
      setCount(c ?? 0);
    }

    fetch();

    // Subscription em tempo real
    const sub = supabase
      .channel(`notif-${user.id}-${tripId ?? 'all'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${user.id}`,
      }, () => fetch())
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [user?.id, tripId]);

  return count;
}

/** Marca todas as notificações de uma viagem como lidas */
export async function markNotificationsRead(userId: string, tripId?: string) {
  let q = (supabase as any)
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', userId)
    .is('read_at', null);

  if (tripId) {
    q = q.eq('data->>tripId', tripId);
  }

  await q;
}
