import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatedPress } from '@/components/AnimatedPress';
import { useFriends, type UserSearchResult } from '@/hooks/useFriends';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function StepCompanions({ selectedIds, onChange }: Props) {
  const styles = useStyles();
  const { accepted, searchUsers } = useFriends();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(text: string) {
    setQuery(text);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const r = await searchUsers(text);
    setSearchResults(r);
    setSearching(false);
  }

  function toggle(id: string) {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter(i => i !== id)
      : [...selectedIds, id]
    );
  }

  const displayList = query.trim().length >= 2 ? searchResults : accepted;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Viajando com alguém?</Text>
      <Text style={styles.subtitle}>
        Selecione amigos para convidar automaticamente para esta viagem.
      </Text>

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
        {searching && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Lista */}
      {displayList.length === 0 && !searching && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {query.trim().length >= 2
              ? 'Nenhum usuário encontrado'
              : 'Adicione amigos em Configurações → Amigos para vê-los aqui'}
          </Text>
        </View>
      )}

      <View style={styles.list}>
        {displayList.map((item: any) => {
          const id = item.friend_id ?? item.id;
          const selected = selectedIds.includes(id);
          return (
            <AnimatedPress
              key={id}
              onPress={() => toggle(id)}
              pressScale={0.97}
              style={[styles.userRow, selected && styles.userRowSelected]}
            >
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
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </AnimatedPress>
          );
        })}
      </View>

      {selectedIds.length > 0 && (
        <Text style={styles.selectedCount}>
          {selectedIds.length} pessoa{selectedIds.length > 1 ? 's' : ''} selecionada{selectedIds.length > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { flex: 1, padding: spacing.lg },
    title: {
      color: colors.text,
      fontSize: fontSize.xxl,
      fontWeight: '800',
      letterSpacing: -0.5,
      marginBottom: spacing.xs,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: fontSize.md,
      paddingVertical: 12,
    },
    list: { gap: spacing.sm },
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
    userRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySofter ?? colors.primarySoft,
    },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 40, height: 40, borderRadius: 20 },
    avatarInitial: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
    userInfo: { flex: 1 },
    userName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
    userEmail: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
    checkbox: {
      width: 24, height: 24, borderRadius: 12,
      borderWidth: 2, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
    emptyWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
    selectedCount: {
      color: colors.primary,
      fontSize: fontSize.sm,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: spacing.md,
    },
  }), [themeVersion]);
}
