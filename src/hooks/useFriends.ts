import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export type Friend = {
  id: string;           // friendship id
  friend_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: 'pending' | 'accepted' | 'blocked';
  direction: 'sent' | 'received';
};

export type UserSearchResult = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_friend: boolean;
  friendship_status: string | null;
};

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await (supabase as any).rpc('get_friends');
    setFriends((data ?? []) as Friend[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function sendRequest(addresseeId: string) {
    if (!user?.id) return;
    await supabase.from('friendships' as any).insert({
      requester_id: user.id,
      addressee_id: addresseeId,
    });
    fetch();
  }

  async function acceptRequest(friendshipId: string) {
    await (supabase as any).from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    fetch();
  }

  async function removeFriend(friendshipId: string) {
    await (supabase as any).from('friendships').delete().eq('id', friendshipId);
    fetch();
  }

  async function searchUsers(query: string): Promise<UserSearchResult[]> {
    if (query.trim().length < 2) return [];
    const { data } = await (supabase as any).rpc('search_users', { _query: query.trim() });
    return (data ?? []) as UserSearchResult[];
  }

  const accepted = friends.filter(f => f.status === 'accepted');
  const pending = friends.filter(f => f.status === 'pending');

  return { friends, accepted, pending, loading, sendRequest, acceptRequest, removeFriend, searchUsers, refetch: fetch };
}
