import { useFocusEffect, useRouter } from 'expo-router';
import {useCallback, useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import {
  AlertTriangle,
  Check,
  CloudOff,
  Database,
  RefreshCw,
  X,
} from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  clearQueue,
  drain,
  getStatus,
  listOperations,
  removeOperation,
  retryOperation,
  type Operation,
} from '@/lib/offlineQueue';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

/**
 * Tela de manutenção da fila de operações offline.
 *
 * Mostra:
 * - Resumo: quantas pendentes, quantas falharam
 * - Lista detalhada de cada operação com:
 *   - tipo (insert/update/delete) + tabela
 *   - timestamp
 *   - status (pendente / aguardando retry / falhou)
 *   - botões "Tentar de novo" e "Remover"
 * - Botão "Sincronizar agora" pra forçar drain manual
 * - Botão "Limpar tudo" (perigoso — descartar todas as ops)
 */
export default function SyncDebugScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const [ops, setOps] = useState<Operation[]>([]);
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [draining, setDraining] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await listOperations();
    const status = await getStatus();
    setOps(list);
    setCounts({ pending: status.pending, failed: status.failed });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleSyncNow() {
    setDraining(true);
    const drained = await drain();
    setDraining(false);
    await refresh();

    if (drained > 0) {
      toast.success(
        `${drained} ${drained === 1 ? 'operação sincronizada' : 'operações sincronizadas'}.`,
      );
    } else {
      toast.info('Nada pra sincronizar agora.');
    }
  }

  async function handleClearAll() {
    Alert.alert(
      'Limpar fila?',
      'Todas as mudanças locais não-sincronizadas serão descartadas. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar tudo',
          style: 'destructive',
          onPress: async () => {
            await clearQueue();
            await refresh();
            toast.success('Fila limpa.');
          },
        },
      ],
    );
  }

  async function handleRetry(op: Operation) {
    await retryOperation(op.id);
    await refresh();
    // Tenta drenar imediatamente
    setDraining(true);
    await drain();
    setDraining(false);
    await refresh();
  }

  async function handleRemove(op: Operation) {
    await removeOperation(op.id);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Resumo */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{counts.pending}</Text>
            <Text style={styles.summaryLabel}>Pendentes</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text
              style={[
                styles.summaryNumber,
                counts.failed > 0 && { color: colors.danger },
              ]}
            >
              {counts.failed}
            </Text>
            <Text style={styles.summaryLabel}>Falharam</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button
            title={draining ? 'Sincronizando…' : 'Sincronizar agora'}
            variant="primary"
            leftIcon={<RefreshCw size={16} color={colors.primaryTextOnSolid} />}
            onPress={handleSyncNow}
            loading={draining}
            disabled={ops.length === 0 || draining}
            style={{ flex: 1 }}
          />
        </View>

        {ops.length === 0 && !loading ? (
          <EmptyState
            icon={<Check size={36} color={colors.primary} />}
            title="Tudo sincronizado!"
            description="Nenhuma mudança pendente no momento. Suas alterações aparecem aqui se o app estiver offline."
          />
        ) : (
          <View style={styles.list}>
            {ops.map((op) => (
              <OperationRow
                key={op.id}
                op={op}
                onRetry={() => handleRetry(op)}
                onRemove={() => handleRemove(op)}
              />
            ))}
          </View>
        )}

        {ops.length > 0 && (
          <Button
            title="Limpar tudo"
            variant="ghost"
            onPress={handleClearAll}
            style={{ marginTop: spacing.lg }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OperationRow({
  op,
  onRetry,
  onRemove,
}: {
  op: Operation;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const opLabel = labelForOp(op);
  const statusLabel = statusForOp(op);
  const isFailed = op.failed;
  const isRetrying = !isFailed && op.attempts > 0;

  return (
    <View style={[styles.row, isFailed && styles.rowFailed]}>
      <View style={styles.rowIcon}>
        {isFailed ? (
          <AlertTriangle size={16} color={colors.danger} />
        ) : isRetrying ? (
          <RefreshCw size={16} color={colors.warning} />
        ) : (
          <CloudOff size={16} color={colors.primary} />
        )}
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {opLabel}
        </Text>
        <Text style={styles.rowStatus} numberOfLines={2}>
          {statusLabel}
        </Text>
        {isFailed && op.lastError && (
          <Text style={styles.rowError} numberOfLines={2}>
            {op.lastError}
          </Text>
        )}
      </View>
      <View style={styles.rowActions}>
        {isFailed && (
          <Pressable onPress={onRetry} hitSlop={8} style={styles.actionBtn}>
            <RefreshCw size={14} color={colors.primary} />
          </Pressable>
        )}
        <Pressable onPress={onRemove} hitSlop={8} style={styles.actionBtn}>
          <X size={14} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

/** Texto amigável: "Adicionar tarefa", "Marcar concluída", etc */
function labelForOp(op: Operation): string {
  const tableMap: Record<string, string> = {
    tasks: 'tarefa',
    expenses: 'despesa',
    expense_shares: 'divisão de despesa',
    expense_categories: 'categoria',
    places: 'lugar',
    lodgings: 'hospedagem',
    itinerary_items: 'parada do roteiro',
    trip_days: 'dia',
    trip_invites: 'convite',
    trips: 'viagem',
  };
  const friendly = tableMap[op.table] ?? op.table;
  if (op.op === 'insert') return `Adicionar ${friendly}`;
  if (op.op === 'update') return `Atualizar ${friendly}`;
  if (op.op === 'delete') return `Remover ${friendly}`;
  if (op.op === 'upsert') return `Salvar ${friendly}`;
  return `${op.op} ${op.table}`;
}

function statusForOp(op: Operation): string {
  if (op.failed) {
    return `Falhou após ${op.attempts} tentativas. Toque ⟳ pra tentar de novo.`;
  }
  if (op.attempts === 0) {
    return formatRelative(op.createdAt) + ' · aguardando sincronização';
  }
  if (op.nextRetryAt && op.nextRetryAt > Date.now()) {
    const wait = Math.ceil((op.nextRetryAt - Date.now()) / 1000);
    return `Tentativa ${op.attempts}. Próxima em ${wait}s.`;
  }
  return `Tentativa ${op.attempts} agendada`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  return `${day}d atrás`;
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowFailed: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
  },
  rowLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowStatus: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  rowError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: 4,
    fontStyle: 'italic',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}), [themeVersion]);
}
