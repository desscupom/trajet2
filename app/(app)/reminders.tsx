import { Stack } from 'expo-router';
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
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import {
  Bell,
  CircleCheck,
  MapPin,
  Plus,
  Trash2,
} from '@/components/Icon';
import { GeoReminderModal } from '@/components/reminders/GeoReminderModal';
import { ReminderModal } from '@/components/reminders/ReminderModal';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import {
  deleteGeoReminder,
  formatDistance,
  listGeoReminders,
  type GeoReminder,
} from '@/lib/geoReminders';
import {
  requestLocationPermissions,
  syncGeofencesWithOS,
} from '@/lib/geofencingTask';
import {
  deleteReminder,
  formatReminderTime,
  getReminderStatus,
  listReminders,
  type UserReminder,
} from '@/lib/userReminders';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type TabKey = 'time' | 'geo';

/**
 * Tela combinada de lembretes:
 * - Aba "Tempo" — user_reminders (disparam por horário, processados por cron)
 * - Aba "Lugar" — geo_reminders (disparam por geofencing, processados no device)
 */
export default function RemindersScreen() {
  const styles = useStyles();
  const toast = useToast();

  const [tab, setTab] = useState<TabKey>('time');
  const [timeReminders, setTimeReminders] = useState<UserReminder[]>([]);
  const [geoReminders, setGeoReminders] = useState<GeoReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [geoModalOpen, setGeoModalOpen] = useState(false);
  const [editingTime, setEditingTime] = useState<UserReminder | null>(null);
  const [editingGeo, setEditingGeo] = useState<GeoReminder | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tr, gr] = await Promise.all([
        listReminders(),
        listGeoReminders(),
      ]);
      setTimeReminders(tr);
      setGeoReminders(gr);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshProps = usePullToRefresh(fetchData);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreate() {
    if (tab === 'time') {
      setEditingTime(null);
      setTimeModalOpen(true);
    } else {
      // Geo: pede permissão se ainda não tem
      const perms = await requestLocationPermissions();
      if (!perms.foreground) {
        toast.error(
          'Precisa permitir acesso à localização pra usar lembretes por lugar.',
        );
        return;
      }
      if (!perms.background) {
        Alert.alert(
          'Permissão de background',
          'Pra avisar quando você chegar no lugar mesmo com o app fechado, conceda acesso "Sempre" à localização nas configurações do celular.',
          [
            { text: 'Continuar mesmo assim', onPress: openGeoModal },
            { text: 'Cancelar', style: 'cancel' },
          ],
        );
        return;
      }
      openGeoModal();
    }
  }

  function openGeoModal() {
    setEditingGeo(null);
    setGeoModalOpen(true);
  }

  function handleDeleteTime(r: UserReminder) {
    Alert.alert('Deletar lembrete?', r.title, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReminder(r.id);
            await fetchData();
          } catch (err: any) {
            toast.error(err?.message ?? 'Erro.');
          }
        },
      },
    ]);
  }

  function handleDeleteGeo(r: GeoReminder) {
    Alert.alert('Deletar lembrete?', r.title, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Deletar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGeoReminder(r.id);
            await syncGeofencesWithOS().catch(() => {});
            await fetchData();
          } catch (err: any) {
            toast.error(err?.message ?? 'Erro.');
          }
        },
      },
    ]);
  }

  const pendingTime = timeReminders
    .filter((r) => getReminderStatus(r) !== 'sent')
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const sentTime = timeReminders
    .filter((r) => getReminderStatus(r) === 'sent')
    .sort((a, b) => b.remind_at.localeCompare(a.remind_at));

  const activeGeo = geoReminders.filter((r) => r.active);
  const inactiveGeo = geoReminders.filter((r) => !r.active);

  const isEmpty =
    tab === 'time'
      ? timeReminders.length === 0
      : geoReminders.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Lembretes' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* Tabs */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setTab('time')}
            style={[styles.tab, tab === 'time' && styles.tabActive]}
          >
            <Bell size={14} color={tab === 'time' ? colors.primary : colors.textMuted} />
            <Text
              style={[
                styles.tabLabel,
                tab === 'time' && styles.tabLabelActive,
              ]}
            >
              Por tempo
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('geo')}
            style={[styles.tab, tab === 'geo' && styles.tabActive]}
          >
            <MapPin size={14} color={tab === 'geo' ? colors.primary : colors.textMuted} />
            <Text
              style={[
                styles.tabLabel,
                tab === 'geo' && styles.tabLabelActive,
              ]}
            >
              Por lugar
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={
                tab === 'time' ? (
                  <Bell size={28} color={colors.primary} />
                ) : (
                  <MapPin size={28} color={colors.primary} />
                )
              }
              title={
                tab === 'time'
                  ? 'Nenhum lembrete ainda'
                  : 'Nenhum lembrete de lugar'
              }
              description={
                tab === 'time'
                  ? 'Crie lembretes pra coisas que você não pode esquecer durante a viagem.'
                  : 'Marque lugares e receba aviso quando chegar. Ex: "Comprar SIM card quando chegar no aeroporto".'
              }
              action={{
                label:
                  tab === 'time' ? 'Criar lembrete' : 'Criar lembrete de lugar',
                onPress: handleCreate,
              }}
            />
          </View>
        ) : tab === 'time' ? (
          <FlatList
            data={pendingTime}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl {...refreshProps} />}
            ListHeaderComponent={
              pendingTime.length > 0 ? (
                <SectionHeader title="Próximos" count={pendingTime.length} />
              ) : (
                <Text style={styles.allDoneText}>
                  Nenhum lembrete pendente 🎉
                </Text>
              )
            }
            renderItem={({ item }) => (
              <FadeInView>
                <TimeReminderCard
                  reminder={item}
                  onPress={() => {
                    setEditingTime(item);
                    setTimeModalOpen(true);
                  }}
                  onDelete={() => handleDeleteTime(item)}
                />
              </FadeInView>
            )}
            ListFooterComponent={
              sentTime.length > 0 ? (
                <>
                  <View style={{ marginTop: spacing.xl }}>
                    <SectionHeader title="Histórico" count={sentTime.length} />
                  </View>
                  {sentTime.map((r) => (
                    <FadeInView key={r.id}>
                      <TimeReminderCard
                        reminder={r}
                        onPress={() => {
                          setEditingTime(r);
                          setTimeModalOpen(true);
                        }}
                        onDelete={() => handleDeleteTime(r)}
                      />
                    </FadeInView>
                  ))}
                </>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={activeGeo}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl {...refreshProps} />}
            ListHeaderComponent={
              <SectionHeader title="Ativos" count={activeGeo.length} />
            }
            renderItem={({ item }) => (
              <FadeInView>
                <GeoReminderCard
                  reminder={item}
                  onPress={() => {
                    setEditingGeo(item);
                    setGeoModalOpen(true);
                  }}
                  onDelete={() => handleDeleteGeo(item)}
                />
              </FadeInView>
            )}
            ListFooterComponent={
              inactiveGeo.length > 0 ? (
                <>
                  <View style={{ marginTop: spacing.xl }}>
                    <SectionHeader title="Inativos" count={inactiveGeo.length} />
                  </View>
                  {inactiveGeo.map((r) => (
                    <FadeInView key={r.id}>
                      <GeoReminderCard
                        reminder={r}
                        onPress={() => {
                          setEditingGeo(r);
                          setGeoModalOpen(true);
                        }}
                        onDelete={() => handleDeleteGeo(r)}
                      />
                    </FadeInView>
                  ))}
                </>
              ) : null
            }
          />
        )}

        {/* FAB */}
        {!isEmpty && (
          <View style={styles.fabWrap}>
            <AnimatedPress
              onPress={handleCreate}
              style={styles.fab}
              pressScale={0.9}
            >
              <Plus size={26} color={colors.primaryTextOnSolid} />
            </AnimatedPress>
          </View>
        )}

        <ReminderModal
          visible={timeModalOpen}
          editing={editingTime}
          onClose={() => {
            setTimeModalOpen(false);
            setEditingTime(null);
          }}
          onSaved={fetchData}
        />

        <GeoReminderModal
          visible={geoModalOpen}
          editing={editingGeo}
          onClose={() => {
            setGeoModalOpen(false);
            setEditingGeo(null);
          }}
          onSaved={fetchData}
        />
      </SafeAreaView>
    </>
  );
}

function TimeReminderCard({
  reminder,
  onPress,
  onDelete,
}: {
  reminder: UserReminder;
  onPress: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const status = getReminderStatus(reminder);
  const isSent = status === 'sent';
  const isOverdue = status === 'overdue';

  return (
    <AnimatedPress
      onPress={onPress}
      onLongPress={onDelete}
      pressScale={0.98}
      style={[styles.card, isSent && styles.cardSent]}
    >
      <View
        style={[
          styles.iconWrap,
          isSent && styles.iconWrapSent,
          isOverdue && styles.iconWrapOverdue,
        ]}
      >
        {isSent ? (
          <CircleCheck size={18} color={colors.success} />
        ) : (
          <Bell size={18} color={isOverdue ? colors.warning : colors.primary} />
        )}
      </View>

      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, isSent && styles.cardTitleSent]}
          numberOfLines={2}
        >
          {reminder.title}
        </Text>
        {reminder.body && (
          <Text style={styles.cardBody2} numberOfLines={2}>
            {reminder.body}
          </Text>
        )}
        <Text
          style={[
            styles.cardTime,
            isOverdue && { color: colors.warning },
            isSent && { color: colors.textMuted },
          ]}
        >
          {isSent
            ? `Enviado · ${formatReminderTime(reminder.remind_at)}`
            : formatReminderTime(reminder.remind_at)}
        </Text>
      </View>

      <Pressable onPress={onDelete} hitSlop={10} style={styles.trashBtn}>
        <Trash2 size={14} color={colors.textMuted} />
      </Pressable>
    </AnimatedPress>
  );
}

function GeoReminderCard({
  reminder,
  onPress,
  onDelete,
}: {
  reminder: GeoReminder;
  onPress: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const wasNotified = !!reminder.notified_at && !reminder.repeat;

  return (
    <AnimatedPress
      onPress={onPress}
      onLongPress={onDelete}
      pressScale={0.98}
      style={[styles.card, wasNotified && styles.cardSent]}
    >
      <View
        style={[
          styles.iconWrap,
          wasNotified && styles.iconWrapSent,
        ]}
      >
        {wasNotified ? (
          <CircleCheck size={18} color={colors.success} />
        ) : (
          <MapPin size={18} color={colors.primary} />
        )}
      </View>

      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, wasNotified && styles.cardTitleSent]}
          numberOfLines={2}
        >
          {reminder.title}
        </Text>
        {reminder.place_name && (
          <Text style={styles.cardBody2} numberOfLines={1}>
            📍 {reminder.place_name}
          </Text>
        )}
        <Text style={styles.cardTime}>
          {reminder.trigger_on === 'enter' ? 'Ao chegar' : 'Ao sair'}
          {' · '}
          raio {formatDistance(reminder.radius_m)}
          {reminder.repeat && ' · repete sempre'}
        </Text>
      </View>

      <Pressable onPress={onDelete} hitSlop={10} style={styles.trashBtn}>
        <Trash2 size={14} color={colors.textMuted} />
      </Pressable>
    </AnimatedPress>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    margin: spacing.lg,
    marginBottom: 0,
    padding: 4,
    borderRadius: radius.pill,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 100,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  allDoneText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
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
  cardSent: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSent: {
    backgroundColor: colors.successSoft,
  },
  iconWrapOverdue: {
    backgroundColor: colors.warningSoft,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  cardTitleSent: {
    textDecorationLine: 'line-through',
  },
  cardBody2: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  cardTime: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: letterSpacing.wide,
  },
  trashBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
}), [themeVersion]);
}
