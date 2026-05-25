import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export type NotificationPreferences = {
  profile_id: string;
  notifications_enabled: boolean;
  task_due_reminder: boolean;
  task_due_offset_minutes: number;
  trip_starting_reminder: boolean;
  trip_starting_offset_days: number;
  trip_edits: boolean;
  expense_added: boolean;
  member_joined: boolean;
  lodging_checkin_reminder: boolean;
  lodging_checkin_offset_minutes: number;
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    if (!user) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (error) {
      console.error(error);
      // Se não tem prefs, cria com defaults
      if (error.code === 'PGRST116') {
        const { data: created } = await supabase
          .from('notification_preferences')
          .insert({ profile_id: user.id })
          .select()
          .single();
        setPrefs(created as NotificationPreferences);
      }
    } else {
      setPrefs(data as NotificationPreferences);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  /**
   * Atualiza uma ou mais prefs. Faz update otimista no estado local
   * antes de bater no Supabase (UI responde na hora).
   */
  async function update(patch: Partial<NotificationPreferences>) {
    if (!user || !prefs) return { error: 'Sem sessão' };

    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);

    const { error } = await supabase
      .from('notification_preferences')
      .update(patch)
      .eq('profile_id', user.id);

    if (error) {
      // Rollback
      setPrefs(prefs);
      return { error: error.message };
    }
    return { error: null };
  }

  return { prefs, loading, update, refetch: fetchPrefs };
}

/**
 * Busca as prefs do usuário atual de forma imperativa (fora de React).
 * Útil pra eventos como "criar tarefa" que precisam decidir se agendam ou não.
 */
export async function getPrefsForCurrentUser(): Promise<{
  prefs: NotificationPreferences | null;
}> {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return { prefs: null };

  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', userId)
    .single();

  return { prefs: data as NotificationPreferences | null };
}
