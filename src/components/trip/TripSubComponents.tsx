/**
 * TripSubComponents — TripStatsRow, MembersBadge, AnimatedTabs.
 * Extraídos do trip/[id]/index.tsx para manter o arquivo principal menor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatedPress } from '@/components/AnimatedPress';
import { ActionSheet } from '@/components/ActionSheet';
import { AvatarStack } from '@/components/Avatar';
import { Calendar, ChevronRight, ListChecks, MapPin, Wallet } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useTripMembers } from '@/hooks/useTripMembers';
import { useTripStats } from '@/hooks/useTripStats';
import { formatCurrency } from '@/lib/expenses';
import type { Trip } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export function TripStatsRow({ trip, onTabChange }: { trip: Trip; onTabChange?: (tab: string) => void }) {
  const styles = useStyles();
  const { stats, loading } = useTripStats(
    trip.id,
    trip.start_date,
    trip.end_date,
    trip.base_currency
  );

  if (loading) return null;

  const items: { icon: React.ReactNode; label: string; tab?: string }[] = [];

  if (stats.daysCount > 0) {
    items.push({
      icon: <Calendar size={13} color={colors.primary} />,
      label: `${stats.daysCount} ${stats.daysCount === 1 ? 'dia' : 'dias'}`,
    });
  }
  if (stats.placesCount > 0) {
    items.push({
      icon: <MapPin size={13} color={colors.primary} />,
      label: `${stats.placesCount} ${stats.placesCount === 1 ? 'lugar' : 'lugares'}`,
      tab: 'places',
    });
  }
  if (stats.expensesTotal > 0) {
    items.push({
      icon: <Wallet size={13} color={colors.primary} />,
      label: formatCurrency(stats.expensesTotal, trip.base_currency),
      tab: 'expenses',
    });
  }
  if (stats.tasksCount > 0) {
    const pendingCount = stats.tasksCount - stats.tasksDoneCount;
    items.push({
      icon: <ListChecks size={13} color={colors.primary} />,
      label: pendingCount === 0 ? `${stats.tasksCount} ✓` : `${pendingCount}/${stats.tasksCount}`,
      tab: 'tasks',
    });
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.statsRow}>
      {items.map((item, idx) => (
        <AnimatedPress
          key={idx}
          pressScale={0.94}
          onPress={() => item.tab && onTabChange?.(item.tab)}
          style={styles.statPill}
        >
          {item.icon}
          <Text style={styles.statText}>{item.label}</Text>
        </AnimatedPress>
      ))}
    </View>
  );
}

export function MembersBadge({
  tripId,
  onPress,
}: {
  tripId: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { members, loading } = useTripMembers(tripId);
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return null;
  if (members.length === 0) return null;

  const stackUsers = members.map((m) => ({
    url: m.profile?.avatar_url,
    name: m.profile?.full_name,
    email: m.profile?.email,
  }));

  return (
    <>
      <AnimatedPress
        onPress={() => setMenuOpen(true)}
        pressScale={0.95}
        style={styles.membersBadge}
      >
        <AvatarStack users={stackUsers} size={26} max={3} />
        <ChevronRight size={14} color={colors.textMuted} />
      </AnimatedPress>

      <ActionSheet
        visible={menuOpen}
        title={`${members.length} viajante${members.length > 1 ? 's' : ''}`}
        onClose={() => setMenuOpen(false)}
        options={[
          { icon: '👤', label: 'Meu perfil', onPress: () => router.push('/(app)/settings' as any) },
          { icon: '👥', label: 'Gerenciar membros', onPress },
        ]}
      />
    </>
  );
}

/**
 * Tabs com indicador deslizante.
 * Mede a posição/largura de cada tab no layout e move o pill
 * de uma pra outra com timing suave.
 */
export function AnimatedTabs<K extends string>({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: { key: K; label: string; badge?: boolean }[];
  activeKey: K;
  onSelect: (key: K) => void;
}) {
  const styles = useStyles();
  // Posição (x, width) de cada tab medida no onLayout
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  // Força re-render quando temos pelo menos um layout pronto
  const [ready, setReady] = useState(false);

  // Quando troca a tab ativa, anima o indicador
  useEffect(() => {
    const target = layouts.current[activeKey];
    if (!target) return;
    // Cubic-bezier com leve overshoot pra dar uma sensação "viva"
    indicatorX.value = withTiming(target.x, {
      duration: 320,
      easing: Easing.bezier(0.34, 1.4, 0.64, 1),
    });
    indicatorWidth.value = withTiming(target.width, {
      duration: 320,
      easing: Easing.bezier(0.34, 1.4, 0.64, 1),
    });
  }, [activeKey, ready, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  return (
    <View style={styles.tabsInner}>
      {/* Pill teal animado por trás dos labels */}
      <Animated.View style={[styles.tabIndicator, indicatorStyle]} />

      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              layouts.current[tab.key] = { x, width };
              // Inicializa o indicador na posição da tab ativa
              if (tab.key === activeKey && indicatorWidth.value === 0) {
                indicatorX.value = x;
                indicatorWidth.value = width;
                setReady(true);
              }
            }}
            style={styles.tab}
          >
            <View style={styles.tabLabelWrap}>
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
              {tab.badge && <View style={styles.tabBadge} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySofter,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  membersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    paddingRight: spacing.sm,
  },
  tabsInner: {
    flexDirection: 'row',
    gap: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: colors.primaryTextOnSolid,
    fontWeight: '700',
  },
  tabLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  }), [themeVersion]);
}
