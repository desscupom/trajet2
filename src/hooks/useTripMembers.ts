import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

export type TripMemberWithProfile = {
  id: string;
  trip_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
};

export type TripInvite = {
  id: string;
  token: string;
  role: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export function useTripMembers(tripId: string) {
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [membersResult, invitesResult] = await Promise.all([
      supabase
        .from('trip_members')
        .select(
          'id, trip_id, profile_id, role, joined_at, profile:profiles(id, full_name, email, avatar_url)'
        )
        .eq('trip_id', tripId)
        .order('joined_at'),
      supabase
        .from('trip_invites')
        .select('*')
        .eq('trip_id', tripId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
    ]);

    if (membersResult.error) console.error(membersResult.error);
    if (invitesResult.error) console.error(invitesResult.error);

    setMembers((membersResult.data ?? []) as unknown as TripMemberWithProfile[]);
    setInvites((invitesResult.data ?? []) as TripInvite[]);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: atualiza quando membros são adicionados/removidos
  useRealtimeTable({
    table: 'trip_members',
    filter: `trip_id=eq.${tripId}`,
    onChange: fetchAll,
  });
  useRealtimeTable({
    table: 'trip_invites',
    filter: `trip_id=eq.${tripId}`,
    onChange: fetchAll,
  });

  return { members, invites, loading, refetch: fetchAll };
}
