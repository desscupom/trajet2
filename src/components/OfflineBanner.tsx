import {useEffect, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CloudOff, RefreshCw } from '@/components/Icon';
import { useOfflineQueueCoordinator } from '@/hooks/useOfflineQueueCoordinator';
import { colors, fontSize, radius, shadow, spacing } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Banner que aparece no topo da tela quando o app está offline OU quando há
 * mudanças pendentes na fila de sync. Some sozinho quando tudo está sincronizado.
 *
 * Toque abre a tela de Sincronização (debug + retry manual).
 *
 * Estados:
 * 1. Online + fila vazia → não renderiza nada
 * 2. Offline (com ou sem fila) → "Sem conexão" (ícone CloudOff)
 * 3. Online + fila pendente → "Sincronizando…" (com count)
 */
export function OfflineBanner() {
  const styles = useStyles();
  const { pendingCount, online, draining } = useOfflineQueueCoordinator();
  const router = useRouter();

  const visible = !online || pendingCount > 0;
  const opacity = useSharedValue(visible ? 1 : 0);
  // Entra de baixo (positivo) pra posição final (0)
  const translateY = useSharedValue(visible ? 0 : 40);

  // Mantém em mount alguns segundos extras após sair (pra animação completar)
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) setShouldRender(true);
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
    translateY.value = withTiming(visible ? 0 : 40, { duration: 250 });
    if (!visible) {
      const t = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!shouldRender) return null;

  // Decide o conteúdo
  let icon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let bgColor: string;

  if (!online) {
    icon = <CloudOff size={16} color={colors.warning} />;
    title = 'Sem conexão';
    subtitle =
      pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? 'mudança' : 'mudanças'} pendente${pendingCount === 1 ? '' : 's'}`
        : 'Suas mudanças serão salvas localmente.';
    bgColor = colors.warningSoft;
  } else if (draining) {
    icon = <RefreshCw size={16} color={colors.primary} />;
    title = 'Sincronizando…';
    subtitle = `${pendingCount} ${pendingCount === 1 ? 'mudança' : 'mudanças'}`;
    bgColor = colors.primarySoft;
  } else {
    icon = <CloudOff size={16} color={colors.warning} />;
    title = 'Sincronização pendente';
    subtitle = `${pendingCount} ${pendingCount === 1 ? 'mudança' : 'mudanças'}`;
    bgColor = colors.warningSoft;
  }

  return (
    <Animated.View style={[styles.wrap, animStyle]} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/(app)/settings/sync')}
        style={[styles.banner, { backgroundColor: bgColor }]}
      >
        {icon}
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
}), [themeVersion]);
}
