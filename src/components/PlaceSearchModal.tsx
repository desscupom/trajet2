import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { Coffee, MapPin, Search, ShoppingBag, Trees, Utensils } from '@/components/Icon';
import { Input } from '@/components/Input';
import {
  debouncedSearchPlaces,
  searchPlaces,
  type SearchResult,
} from '@/lib/places';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (place: SearchResult) => void;
  /** Cidade pra usar como contexto das sugestões (ex: "Lisboa"). Opcional. */
  tripContext?: string | null;
};

type CategoryChip = {
  key: string;
  label: string;
  /** Termo de busca a usar quando o user clica */
  query: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
};

const CATEGORIES: CategoryChip[] = [
  { key: 'food', label: 'Restaurantes', query: 'restaurant', Icon: Utensils },
  { key: 'cafe', label: 'Cafés', query: 'cafe', Icon: Coffee },
  { key: 'tourist', label: 'Pontos turísticos', query: 'tourist attraction', Icon: MapPin },
  { key: 'park', label: 'Parques', query: 'park', Icon: Trees },
  { key: 'shopping', label: 'Compras', query: 'shopping', Icon: ShoppingBag },
];

export function PlaceSearchModal({
  visible,
  onClose,
  onPick,
  tripContext,
}: Props) {
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Reset ao fechar
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setActiveCategory(null);
      setSearching(false);
    }
  }, [visible]);

  // Busca por digitação
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setActiveCategory(null);
    setSearching(true);
    debouncedSearchPlaces(query, 400, (found) => {
      setResults(found);
      setSearching(false);
    });
  }, [query]);

  // Busca por categoria
  async function handleCategoryPress(cat: CategoryChip) {
    if (activeCategory === cat.key) {
      // Toggle off
      setActiveCategory(null);
      setResults([]);
      return;
    }
    setActiveCategory(cat.key);
    setQuery('');
    setSearching(true);

    // Combina cat.query + tripContext pra dar contexto
    const fullQuery = tripContext
      ? `${cat.query} in ${tripContext}`
      : cat.query;
    try {
      const found = await searchPlaces(fullQuery);
      setResults(found);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  function handlePick(place: SearchResult) {
    onPick(place);
    onClose();
  }

  // Estado vazio = mostra chips
  const isEmptyState =
    query.trim().length < 3 && !activeCategory && !searching;

  const showResults = results.length > 0;

  const headerSubtitle = useMemo(() => {
    if (activeCategory) {
      const cat = CATEGORIES.find((c) => c.key === activeCategory);
      return tripContext
        ? `${cat?.label} em ${tripContext}`
        : cat?.label;
    }
    return null;
  }, [activeCategory, tripContext]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Adicionar lugar</Text>
          <Button title="Cancelar" variant="ghost" size="sm" onPress={onClose} />
        </View>

        <View style={styles.searchBox}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={
              tripContext
                ? `Buscar em ${tripContext}…`
                : 'Buscar (ex: Torre Eiffel)'
            }
            autoCapitalize="none"
            leftIcon={<Search size={18} color={colors.textMuted} />}
          />
        </View>

        {/* Chips de categoria — sempre visíveis quando não está digitando */}
        {(isEmptyState || activeCategory) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            style={styles.chipsScroll}
          >
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              const Icon = cat.Icon;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => handleCategoryPress(cat)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Icon
                    size={14}
                    color={active ? colors.primaryTextOnSolid : colors.text}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!!headerSubtitle && (
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        )}

        {searching && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>Buscando…</Text>
          </View>
        )}

        {!searching && query.trim().length >= 3 && results.length === 0 && (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              Nada encontrado para &ldquo;{query}&rdquo;.
            </Text>
          </View>
        )}

        {!searching && activeCategory && results.length === 0 && (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              Nenhum resultado nessa categoria.
            </Text>
          </View>
        )}

        {/* Estado vazio inicial: explica o que fazer */}
        {isEmptyState && (
          <View style={styles.hint}>
            <View style={styles.hintIconWrap}>
              <Search size={28} color={colors.primary} />
            </View>
            <Text style={styles.hintText}>
              Digite o nome do lugar ou escolha uma categoria acima.
            </Text>
            <Text style={styles.hintSubtext}>Resultados via OpenStreetMap.</Text>
          </View>
        )}

        {showResults && (
          <FlatList
            data={results}
            keyExtractor={(item) => item.externalId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handlePick(item)}
                style={({ pressed }) => [
                  styles.resultRow,
                  pressed && styles.resultPressed,
                ]}
              >
                {/* Foto ou ícone de categoria */}
                <PlaceThumb result={item} />

                <View style={styles.resultMain}>
                  {/* Nome principal — grande como no Google Maps */}
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name}
                  </Text>

                  {/* Linha secundária: categoria · bairro */}
                  <Text style={styles.resultSecondary} numberOfLines={1}>
                    {[item.category, item.neighborhood].filter(Boolean).join('  ·  ') || item.fullAddress}
                  </Text>

                  {/* Endereço completo só se diferente do nome */}
                  {item.fullAddress && item.fullAddress !== item.name && (
                    <Text style={styles.resultAddress} numberOfLines={1}>
                      {item.fullAddress}
                    </Text>
                  )}
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// Emojis de categoria para o fallback visual
const CATEGORY_EMOJI: Record<string, string> = {
  Restaurante: '🍽️', Café: '☕', Bar: '🍺', 'Fast food': '🍔',
  Hotel: '🏨', Hostel: '🛏️', Museu: '🏛️', Atração: '⭐',
  Mirante: '🌄', Parque: '🌳', Praia: '🏖️', Monumento: '🗿',
  Igreja: '⛪', Catedral: '⛪', Castelo: '🏰', Mercado: '🛒',
  Shopping: '🛍️', Supermercado: '🛒', Aeroporto: '✈️', Estação: '🚉',
};

function PlaceThumb({ result }: { result: SearchResult }) {
  const [imgError, setImgError] = useState(false);

  if (result.photo_url && !imgError) {
    return (
      <Image
        source={{ uri: result.photo_url }}
        style={thumbStyles.img}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: emoji de categoria numa caixa colorida
  const emoji = (result.category && CATEGORY_EMOJI[result.category]) || '📍';
  return (
    <View style={thumbStyles.fallback}>
      <Text style={thumbStyles.emoji}>{emoji}</Text>
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  img: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    flexShrink: 0,
  },
  fallback: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: { fontSize: 22 },
});

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  searchBox: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipsRow: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  statusText: { color: colors.textMuted, fontSize: fontSize.sm },
  hint: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  hintIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  hintText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
    maxWidth: 280,
  },
  hintSubtext: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  resultPressed: { backgroundColor: colors.surfaceHover },
  resultMain: { flex: 1, gap: 2 },
  resultName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  resultSecondary: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 1,
  },
  resultNeighborhood: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  resultAddress: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  categoryBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  categoryText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
}), [themeVersion]);
}
