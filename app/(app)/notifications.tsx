import { Stack, useRouter } from 'expo-router';
import {useCallback, useEffect, useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import {
  Bell,
  CircleCheck,
  KeyRound,
  ListChecks,
  MapPin,
  Trash2,
  Users,
  Wallet,
} from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import {
  deleteNotification,
  formatRelativeTime,
  listNotifications,
  markAllAsRead,
  markAsRead,
  type InAppNotification,
  type NotificationType,
} from '@/lib/notificationsInApp';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

/**
 * Tela com lista de notificações in-app.
 *
 * Funcionalidades:
 * - Lista (mais recente primeiro)
 * - Pull-to-refresh
 * - Tap em notificação não lida → marca como lida + navega pra tela relevante (trip)
 * - Botão "Marcar tudo como lido" se houver não lidas
 * - Swipe ou long-press pra deletar (long-press com Alert pra simplicidade)
 */
export default function NotificationsListScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const list = await listNotifications();
      setNotifications(list);
    } catch (err) {
      console.warn('Erro carregando notificações:', err);
      toast.error('Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshProps = usePullToRefresh(fetchData);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleNotificationPress(notif: InAppNotification) {
    // Marca como lida se ainda não foi
    if (!notif.read_at) {
      try {
        await markAsRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        );
      } catch (err) {
        console.warn('Erro marcando como lida:', err);
      }
    }

    // Navega de acordo com o tipo / dados
    const tripId = notif.data?.trip_id;
    if (tripId) {
      router.push(`/(app)/trip/${tripId}`);
    }
  }

  function handleLongPress(notif: InAppNotification) {
    Alert.alert(notif.title, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNotification(notif.id);
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
          } catch (err) {
            toast.error('Erro ao deletar.');
          }
        },
      },
    ]);
  }

  async function handleMarkAll() {
    try {
      await markAllAsRead();
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      toast.success('Todas marcadas como lidas.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro.');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notificações',
          headerRight: unreadCount > 0
            ? () => (
                <Pressable
                  onPress={handleMarkAll}
                  hitSlop={8}
                  style={{ marginRight: spacing.md }}
                >
                  <Text style={styles.markAllText}>Marcar tudo</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={28} color={colors.primary} />}
            title="Nenhuma notificação"
            description="Quando algo importante acontecer nas suas viagens, vai aparecer aqui."
          />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl {...refreshProps} />}
            renderItem={({ item }) => (
              <FadeInView>
                <NotificationCard
                  notif={item}
                  onPress={() => handleNotificationPress(item)}
                  onLongPress={() => handleLongPress(item)}
                />
              </FadeInView>
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}

/**
 * Card individual de notificação.
 * Mostra ícone por tipo + título + body + tempo relativo.
 * Cor de fundo diferente se ainda não foi lida.
 */
function NotificationCard({
  notif,
  onPress,
  onLongPress,
}: {
  notif: InAppNotification;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const styles = useStyles();
  const isUnread = !notif.read_at;
  const IconForType = iconForNotificationType(notif.type);

  return (
    <AnimatedPress
      onPress={onPress}
      onLongPress={onLongPress}
      pressScale={0.98}
      style={[
        styles.card,
        isUnread && styles.cardUnread,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          isUnread && { backgroundColor: colors.primarySoft },
        ]}
      >
        <IconForType
          size={18}
          color={isUnread ? colors.primary : colors.textMuted}
        />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text
            style={[
              styles.title,
              isUnread && styles.titleUnread,
            ]}
            numberOfLines={2}
          >
            {notif.title}
          </Text>
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        {notif.body && (
          <Text style={styles.body} numberOfLines={2}>
            {notif.body}
          </Text>
        )}
        <Text style={styles.time}>{formatRelativeTime(notif.created_at)}</Text>
      </View>
    </AnimatedPress>
  );
}

/**
 * Ícone Lucide pra cada tipo de notificação.
 */
function iconForNotificationType(type: NotificationType): typeof Bell {
  switch (type) {
    case 'trip_starting':
      return MapPin;
    case 'lodging_checkin':
      return KeyRound;
    case 'task_due':
      return ListChecks;
    case 'expense_added':
      return Wallet;
    case 'member_joined':
      return Users;
    case 'public_share_viewed':
      return CircleCheck;
    default:
      return Bell;
  }
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  markAllText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: {
    backgroundColor: colors.primarySofter,
    borderColor: colors.primarySoft,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  titleUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 5,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    lineHeight: 18,
  },
  time: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 6,
    letterSpacing: letterSpacing.wide,
  },
}), [themeVersion]);
}
