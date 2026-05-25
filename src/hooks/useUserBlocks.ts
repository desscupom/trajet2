/**
 * useUserBlocks — gerencia bloqueios de usuários.
 * Carrega lista de bloqueados, permite bloquear e desbloquear.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type BlockedUser = {
  id: string;          // id da linha em user_blocks
  blocked_id: string;
  blocked_at: string;
  profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
};

export function useUserBlocks(currentUserId: string | null) {
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_blocks')
        .select('id, blocked_id, created_at, profile:profiles!blocked_id(full_name, email, avatar_url)')
        .eq('blocker_id', currentUserId)
        .order('created_at', { ascending: false });

      setBlocks(
        (data ?? []).map((row: any) => ({
          id: row.id,
          blocked_id: row.blocked_id,
          blocked_at: row.created_at,
          profile: row.profile,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  const blockUser = useCallback(async (blockedId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: currentUserId, blocked_id: blockedId });
    if (!error) await load();
    return !error;
  }, [currentUserId, load]);

  const unblockUser = useCallback(async (blockedId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', blockedId);
    if (!error) await load();
    return !error;
  }, [currentUserId, load]);

  const isBlocked = useCallback(
    (userId: string) => blocks.some((b) => b.blocked_id === userId),
    [blocks]
  );

  return { blocks, loading, blockUser, unblockUser, isBlocked, reload: load };
}
