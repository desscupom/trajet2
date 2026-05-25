import { useCallback, useState } from 'react';
import { type RefreshControlProps } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Hook utilitário pra gerenciar pull-to-refresh em listas.
 *
 * Uso:
 * ```tsx
 * const refreshProps = usePullToRefresh(fetchData);
 * <FlatList refreshControl={<RefreshControl {...refreshProps} />} />
 * ```
 *
 * @param fetcher função async que recarrega os dados
 * @returns props prontos pra passar pro RefreshControl
 */
export function usePullToRefresh(fetcher: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetcher();
    } finally {
      setRefreshing(false);
    }
  }, [fetcher]);

  return {
    refreshing,
    onRefresh,
    tintColor: colors.primary,
    colors: [colors.primary],
    progressBackgroundColor: colors.surface,
  } satisfies Partial<RefreshControlProps>;
}
