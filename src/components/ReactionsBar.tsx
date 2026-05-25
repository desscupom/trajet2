import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { sendPushToTripMembers } from '@/lib/sendPush';
import { colors, radius, spacing } from '@/lib/theme';

const EMOJIS = ['👍', '❤️', '😮', '💡', '👎'];

type Reaction = { id: string; emoji: string; profile_id: string };

type Props = {
  tripId: string;
  itemId: string;
};

export function ReactionsBar({ tripId, itemId }: Props) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('reactions')
      .select('id, emoji, profile_id')
      .eq('itinerary_item_id', itemId);
    if (!error && data) setReactions(data as Reaction[]);
  }, [itemId]);

  useEffect(() => {
    fetchReactions();
    const channel = supabase
      .channel(`reactions:${itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: `itinerary_item_id=eq.${itemId}` },
        () => fetchReactions()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, fetchReactions]);

  async function handleReact(emoji: string) {
    if (!user || loading) return;
    setLoading(true);
    try {
      const existing = reactions.find((r) => r.profile_id === user.id);
      if (existing) {
        if (existing.emoji === emoji) {
          // Remove — optimistic
          setReactions((prev) => prev.filter((r) => r.id !== existing.id));
          await supabase.from('reactions').delete().eq('id', existing.id);
        } else {
          // Troca — optimistic
          setReactions((prev) => prev.map((r) => r.id === existing.id ? { ...r, emoji } : r));
          await supabase.from('reactions').update({ emoji }).eq('id', existing.id);
        }
      } else {
        // Nova reação — optimistic com id temporário
        const tempId = `tmp_${Date.now()}`;
        setReactions((prev) => [...prev, { id: tempId, emoji, profile_id: user.id }]);
        const { data, error } = await supabase
          .from('reactions')
          .insert({ trip_id: tripId, itinerary_item_id: itemId, profile_id: user.id, emoji })
          .select('id, emoji, profile_id')
          .single();
        if (!error && data) {
          setReactions((prev) => prev.map((r) => r.id === tempId ? data as Reaction : r));
          // Push para os demais membros
          sendPushToTripMembers({
            tripId,
            excludeProfileId: user.id,
            title: 'Nova reação no roteiro',
            body: `Alguém reagiu com ${emoji}`,
            data: { type: 'reaction', tripId, itemId },
          }).catch(() => {});
        } else {
          setReactions((prev) => prev.filter((r) => r.id !== tempId));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // Agrupa por emoji
  const counts: Record<string, { count: number; mine: boolean }> = {};
  for (const r of reactions) {
    if (!counts[r.emoji]) counts[r.emoji] = { count: 0, mine: false };
    counts[r.emoji].count++;
    if (r.profile_id === user?.id) counts[r.emoji].mine = true;
  }

  const activeEmojis = EMOJIS.filter((e) => counts[e]?.count > 0);
  const inactiveEmojis = EMOJIS.filter((e) => !counts[e]?.count);

  return (
    <View style={s.wrap}>
      {/* Reações ativas com contagem */}
      {activeEmojis.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => handleReact(emoji)}
          style={[s.chip, counts[emoji]?.mine && s.chipMine]}
          disabled={loading}
        >
          <Text style={s.chipEmoji}>{emoji}</Text>
          <Text style={[s.chipCount, counts[emoji]?.mine && s.chipCountMine]}>
            {counts[emoji].count}
          </Text>
        </Pressable>
      ))}

      {/* Botão + para adicionar nova reação */}
      {inactiveEmojis.length > 0 && (
        <View style={s.addWrap}>
          {inactiveEmojis.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => handleReact(emoji)}
              style={s.addBtn}
              hitSlop={4}
              disabled={loading}
            >
              <Text style={s.addEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  chipMine: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipEmoji: { fontSize: 13 },
  chipCount: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  chipCountMine: { color: colors.primary },
  addWrap: {
    flexDirection: 'row', gap: 2,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  addBtn: { padding: 1 },
  addEmoji: { fontSize: 12 },
});
