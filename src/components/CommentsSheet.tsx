import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Send, X } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { sendPushToTripMembers } from '@/lib/sendPush';

/** Dispara push para membros quando alguém comenta. Fire-and-forget. */
async function notifyCommentAdded(tripId: string, senderId: string, label: string, body: string) {
  await sendPushToTripMembers({
    tripId,
    excludeProfileId: senderId,
    title: `Novo comentário em ${label}`,
    body: body.length > 60 ? body.slice(0, 57) + '...' : body,
    data: { type: 'comment', tripId },
  });
}
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Comment = {
  id: string;
  body: string;
  created_at: string;
  profile_id: string;
  profile: { full_name: string | null; email: string } | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  entityType: 'itinerary_item' | 'expense' | 'task' | 'lodging' | 'day';
  entityId: string;
  entityTitle?: string;
};

export function CommentsSheet({ visible, onClose, tripId, entityType, entityId, entityTitle }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    fetchComments();

    const channel = supabase
      .channel(`comments:${entityType}:${entityId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `entity_id=eq.${entityId}`,
      }, () => fetchComments())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [visible, entityId]);

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('id, body, created_at, profile_id, profile:profiles(full_name, email)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });
    setComments((data ?? []) as unknown as Comment[]);
    setLoading(false);
  }

  async function handleSend() {
    if (!body.trim() || !user) return;
    const text = body.trim();
    setSending(true);
    setBody('');

    // Optimistic: adiciona na lista imediatamente
    const tempComment: Comment = {
      id: `tmp_${Date.now()}`,
      body: text,
      created_at: new Date().toISOString(),
      profile_id: user.id,
      profile: { full_name: user.user_metadata?.full_name ?? null, email: user.email ?? '' },
    };
    setComments((prev) => [...prev, tempComment]);

    // Persiste no banco
    const { data, error } = await supabase.from('comments').insert({
      trip_id: tripId,
      profile_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      body: text,
    }).select('id, body, created_at, profile_id, profile:profiles(full_name, email)').single();

    if (!error && data) {
      // Substitui o id temporário pelo real
      setComments((prev) => prev.map((cm) => cm.id === tempComment.id ? (data as unknown as Comment) : cm));
      // Push para os demais membros da viagem
      notifyCommentAdded(tripId, user.id, entityTitle ?? entityType, text).catch(() => {});
    } else if (error) {
      // Reverte se falhou
      setComments((prev) => prev.filter((cm) => cm.id !== tempComment.id));
      setBody(text);
    }
    setSending(false);
  }

  async function handleDelete(commentId: string) {
    await supabase.from('comments').delete().eq('id', commentId);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Comentários</Text>
            {entityTitle && <Text style={s.headerSub} numberOfLines={1}>{entityTitle}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={8}><X size={20} color={colors.textMuted} /></Pressable>
        </View>

        {/* Lista */}
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyText}>Nenhum comentário ainda.{'\n'}Seja o primeiro!</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isOwn = item.profile_id === user?.id;
              const name = item.profile?.full_name ?? item.profile?.email ?? '?';
              const initials = name.slice(0, 2).toUpperCase();
              return (
                <Pressable
                  onLongPress={() => isOwn && handleDelete(item.id)}
                  style={[s.bubble, isOwn && s.bubbleOwn]}
                >
                  {!isOwn && (
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{initials}</Text>
                    </View>
                  )}
                  <View style={[s.bubbleContent, isOwn && s.bubbleContentOwn]}>
                    {!isOwn && <Text style={s.bubbleName}>{name}</Text>}
                    <Text style={[s.bubbleBody, isOwn && s.bubbleBodyOwn]}>{item.body}</Text>
                    <Text style={[s.bubbleTime, isOwn && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              value={body}
              onChangeText={setBody}
              placeholder="Escreva um comentário..."
              placeholderTextColor={colors.textMuted}
              style={s.input}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <AnimatedPress onPress={handleSend} disabled={!body.trim() || sending} pressScale={0.9} style={[s.sendBtn, (!body.trim() || sending) && { opacity: 0.4 }]}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
            </AnimatedPress>
          </View>
          {body.length > 400 && (
            <Text style={s.charCount}>{500 - body.length} caracteres restantes</Text>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 22 },
  bubble: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  bubbleOwn: { flexDirection: 'row-reverse' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  avatarText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  bubbleContent: { maxWidth: '75%', backgroundColor: colors.surface, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  bubbleContentOwn: { backgroundColor: colors.primarySoft, borderTopLeftRadius: radius.lg, borderTopRightRadius: 4, borderColor: colors.primary + '30' },
  bubbleName: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700', marginBottom: 3 },
  bubbleBody: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  bubbleBodyOwn: { color: colors.text },
  bubbleTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: fontSize.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  charCount: { color: colors.textMuted, fontSize: 10, textAlign: 'right', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
});
