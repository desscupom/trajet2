import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/Toast';
import { AnimatedPress } from '@/components/AnimatedPress';
import { useFriends, type UserSearchResult } from '@/hooks/useFriends';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export default function FriendsScreen() {
  const styles = useStyles();
  const toast = useToast();
  const { accepted, pending, loading, sendRequest, acceptRequest, removeFriend, searchUsers, refetch } = useFriends();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchUsers(text);
    setSearchResults(results);
    setSearching(false);
  }

  async function handleAdd(userId: string) {
    await sendRequest(userId);
    toast.success('Pedido de amizade enviado!');
    setSearchResults(prev => prev.map(r => r.id === userId ? { ...r, is_friend: true, friendship_status: 'pending' } : r));
  }

  async function handleAccept(friendshipId: string) {
    await acceptRequest(friendshipId);
    toast.success('Amizade aceita!');
  }

  async function handleRemove(friendshipId: string) {
    await removeFriend(friendshipId);
    toast.info('Amigo removido.');
  }

  const showSearch = query.trim().length >= 2;

  return (
    <>
      <Stack.Screen options={{ title: 'Amigos' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Campo de busca */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou email..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
        </View>

        {/* Resultados de busca */}
        {showSearch ? (
          <FlatList keyboardShouldPersistTaps="handled"
            data={searchResults}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={!searching ? (
              <Text style={styles.emptyText}>Nenhum usuário encontrado</Text>
            ) : null}
            renderItem={({ item }) => (
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    : <Text style={styles.avatarInitial}>{(item.full_name ?? item.email ?? '?')[0].toUpperCase()}</Text>
                  }
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.full_name ?? 'Sem nome'}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
                {!item.is_friend ? (
                  <AnimatedPress onPress={() => handleAdd(item.id)} pressScale={0.95} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>+ Adicionar</Text>
                  </AnimatedPress>
                ) : (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>
                      {item.friendship_status === 'accepted' ? 'Amigo' : 'Pendente'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          />
        ) : (
          <FlatList keyboardShouldPersistTaps="handled"
            data={[
              ...pending.filter(f => f.direction === 'received').map(f => ({ ...f, _type: 'pending_received' })),
              ...accepted.map(f => ({ ...f, _type: 'friend' })),
              ...pending.filter(f => f.direction === 'sent').map(f => ({ ...f, _type: 'pending_sent' })),
            ]}
            keyExtractor={i => i.id}
            refreshing={loading}
            onRefresh={refetch}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <Text style={styles.sectionHeader}>
                {pending.filter(f => f.direction === 'received').length > 0
                  ? `${pending.filter(f => f.direction === 'received').length} pedido(s) pendente(s)`
                  : `${accepted.length} amigo${accepted.length !== 1 ? 's' : ''}`}
              </Text>
            }
            ListEmptyComponent={!loading ? (
              <Text style={styles.emptyText}>Busque pessoas pelo nome ou email para adicionar amigos</Text>
            ) : null}
            renderItem={({ item }: any) => (
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    : <Text style={styles.avatarInitial}>{(item.full_name ?? item.email ?? '?')[0].toUpperCase()}</Text>
                  }
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.full_name ?? 'Sem nome'}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
                {item._type === 'pending_received' && (
                  <AnimatedPress onPress={() => handleAccept(item.id)} pressScale={0.95} style={styles.acceptBtn}>
                    <Text style={styles.acceptBtnText}>Aceitar</Text>
                  </AnimatedPress>
                )}
                {item._type === 'friend' && (
                  <Pressable onPress={() => handleRemove(item.id)}>
                    <Text style={styles.removeText}>Remover</Text>
                  </Pressable>
                )}
                {item._type === 'pending_sent' && (
                  <Text style={styles.pendingText}>Aguardando</Text>
                )}
              </View>
            )}
          />
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.md,
      paddingVertical: 12,
    },
    list: { padding: spacing.md, gap: spacing.sm },
    sectionHeader: {
      color: colors.textMuted,
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 44, height: 44, borderRadius: 22 },
    avatarInitial: { color: colors.primary, fontSize: fontSize.lg, fontWeight: '700' },
    userInfo: { flex: 1 },
    userName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    userEmail: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
    addBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    addBtnText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
    acceptBtn: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
    },
    acceptBtnText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
    statusBadge: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    statusText: { color: colors.textMuted, fontSize: fontSize.xs },
    removeText: { color: colors.danger, fontSize: fontSize.xs },
    pendingText: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic' },
    emptyText: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
  }), [themeVersion]);
}
