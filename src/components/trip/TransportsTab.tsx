import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatedPress } from '@/components/AnimatedPress';
import { EmptyState } from '@/components/EmptyState';
import { FadeInView } from '@/components/FadeInView';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type Trip } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import {
  TransportModal,
  TRANSPORT_META,
  type Transport,
  type TransportType,
} from './TransportModal';

type Props = { trip: Trip };

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    '  ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function durationLabel(departs: string | null, arrives: string | null, minutes?: number | null) {
  if (minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`;
  }
  if (!departs || !arrives) return null;
  const diff = (new Date(arrives).getTime() - new Date(departs).getTime()) / 60000;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = Math.round(diff % 60);
  return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`;
}

export function TransportsTab({ trip }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();
  const [transports, setTransports] = useState<Transport[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Transport | null>(null);

  const fetchTransports = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('transports')
      .select('*')
      .eq('trip_id', trip.id)
      .order('departs_at', { ascending: true });
    setTransports((data ?? []) as Transport[]);
    setLoading(false);
  }, [trip.id]);

  useFocusEffect(useCallback(() => { fetchTransports(); }, [fetchTransports]));

  async function handleDelete(id: string, label: string) {
    Alert.alert('Remover transporte', `Remover "${label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await (supabase as any).from('transports').delete().eq('id', id);
          fetchTransports();
        },
      },
    ]);
  }

  const renderCard = ({ item }: { item: Transport }) => {
    const meta = TRANSPORT_META[item.type];
    const dur = durationLabel(item.departs_at ?? null, item.arrives_at ?? null, item.duration_minutes);
    // isPersonal = transporte visível só ao criador

    return (
      <FadeInView>
        <AnimatedPress
          onPress={() => setEditing(item)}
          onLongPress={() => handleDelete(item.id, `${item.origin_name} → ${item.destination_name}`)}
          pressScale={0.98}
          style={styles.card}
        >
          {/* Cabeçalho */}
          <View style={styles.cardHeader}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeIcon}>{meta.icon}</Text>
              <Text style={styles.typeBadgeLabel}>{meta.label}</Text>
            </View>
            <View style={styles.cardHeaderRight}>
              {item.is_personal && (
                <Text style={styles.personalBadge}>🔒 Só eu</Text>
              )}
              {item.number && (
                <Text style={styles.numberBadge}>{item.number}</Text>
              )}
            </View>
          </View>

          {/* Rota */}
          <View style={styles.routeRow}>
            <View style={styles.routePoint}>
              <Text style={styles.routeCode}>{item.origin_code || ''}</Text>
              <Text style={styles.routeCity} numberOfLines={1}>{item.origin_name}</Text>
              {item.departs_at && (
                <Text style={styles.routeTime}>{formatDateTime(item.departs_at)}</Text>
              )}
            </View>

            <View style={styles.routeMiddle}>
              <View style={styles.routeLine}>
                <View style={styles.routeDot} />
                <View style={styles.routeLineFill} />
                <View style={styles.routeArrow}><Text style={styles.routeArrowText}>›</Text></View>
              </View>
              {dur && <Text style={styles.durLabel}>{dur}</Text>}
            </View>

            <View style={[styles.routePoint, { alignItems: 'flex-end' }]}>
              <Text style={styles.routeCode}>{item.destination_code || ''}</Text>
              <Text style={styles.routeCity} numberOfLines={1}>{item.destination_name}</Text>
              {item.arrives_at && (
                <Text style={styles.routeTime}>{formatDateTime(item.arrives_at)}</Text>
              )}
            </View>
          </View>

          {/* Rodapé */}
          {(item.operator || item.reservation_code || item.cost_amount) && (
            <View style={styles.cardFooter}>
              {item.operator && (
                <Text style={styles.footerItem}>{item.operator}</Text>
              )}
              {item.reservation_code && (
                <Text style={styles.footerItem}>📋 {item.reservation_code}</Text>
              )}
              {item.cost_amount && (
                <Text style={styles.footerItem}>
                  {item.cost_currency} {item.cost_amount.toFixed(2)}
                </Text>
              )}
            </View>
          )}
        </AnimatedPress>
      </FadeInView>
    );
  };

  // Agrupa por data
  const grouped = useMemo(() => {
    const byDate: Record<string, Transport[]> = {};
    const undated: Transport[] = [];
    transports.forEach((t) => {
      if (t.departs_at) {
        const date = t.departs_at.slice(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(t);
      } else {
        undated.push(t);
      }
    });
    const result: Array<{ key: string; title: string; data: Transport[] }> = [];
    Object.keys(byDate).sort().forEach((date) => {
      const d = new Date(date + 'T12:00:00');
      result.push({
        key: date,
        title: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }),
        data: byDate[date],
      });
    });
    if (undated.length > 0) result.push({ key: 'undated', title: 'Sem data', data: undated });
    return result;
  }, [transports]);

  const flatData: Array<Transport | { _sectionHeader: string; _key: string }> = useMemo(() => {
    const out: any[] = [];
    grouped.forEach((g) => {
      out.push({ _sectionHeader: g.title, _key: g.key });
      g.data.forEach((t) => out.push(t));
    });
    return out;
  }, [grouped]);

  return (
    <View style={styles.container}>
      <FlatList
        data={flatData}
        keyExtractor={(item: any) => item.id ?? item._key}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTransports} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }: any) => {
          if (item._sectionHeader) {
            return <Text style={styles.dateHeader}>{item._sectionHeader}</Text>;
          }
          return renderCard({ item });
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="🚀"
              title="Nenhum transporte"
              description="Adicione voos, ônibus, trens, carros e qualquer meio de transporte da sua viagem."
              action={{ label: 'Adicionar transporte', onPress: () => setAddOpen(true) }}
            />
          ) : null
        }
      />

      {transports.length > 0 && (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <AnimatedPress onPress={() => setAddOpen(true)} pressScale={0.92} style={styles.fab}>
            <Text style={styles.fabText}>+</Text>
          </AnimatedPress>
        </View>
      )}

      <TransportModal
        visible={addOpen}
        trip={trip}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); fetchTransports(); }}
      />
      <TransportModal
        visible={!!editing}
        trip={trip}
        transport={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); fetchTransports(); }}
      />
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
    dateHeader: {
      color: colors.textMuted, fontSize: fontSize.xs,
      fontWeight: '700', letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingVertical: spacing.xs,
      marginTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    typeBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.primarySofter,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
    },
    typeBadgeIcon: { fontSize: 14 },
    typeBadgeLabel: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
    cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    personalBadge: { color: colors.textMuted, fontSize: fontSize.xs },
    numberBadge: {
      color: colors.textMuted, fontSize: fontSize.xs,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      paddingHorizontal: 6, paddingVertical: 3,
      fontWeight: '600',
    },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    routePoint: { flex: 1 },
    routeCode: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
    routeCity: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
    routeTime: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
    routeMiddle: { flex: 1, alignItems: 'center', gap: 4 },
    routeLine: { flexDirection: 'row', alignItems: 'center', width: '100%' },
    routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
    routeLineFill: { flex: 1, height: 1, backgroundColor: colors.border },
    routeArrow: {},
    routeArrowText: { color: colors.border, fontSize: 16 },
    durLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
    cardFooter: {
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    },
    footerItem: { color: colors.textMuted, fontSize: fontSize.xs },
    fabWrap: { position: 'absolute', bottom: spacing.xl, right: spacing.lg },
    fab: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    fabText: { color: '#fff', fontSize: 28, marginTop: -2 },
  }), [themeVersion]);
}
