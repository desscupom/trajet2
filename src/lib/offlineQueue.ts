import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const QUEUE_KEY = 'trajet:offline_queue';

/**
 * Tipo de operação que pode ser enfileirada.
 *
 * NÃO suportamos: storage uploads, RPC calls (auth.signUp, accept_trip_invite).
 * Esses falham se offline e precisam de net.
 */
export type Operation = {
  /** UUID local pra identificação na queue (não tem relação com IDs do banco) */
  id: string;
  /** Nome da tabela: 'tasks', 'expenses', etc */
  table: string;
  /** Tipo de operação. */
  op: 'insert' | 'update' | 'delete' | 'upsert';
  /** Dados pra insert/update/upsert (não usado em delete) */
  payload?: Record<string, any>;
  /** Filtros .eq() pra update/delete: { id: 'abc-123', trip_id: 'xyz' } */
  filters?: Record<string, any>;
  /** Quando foi enfileirada — usado pra ordenar replay e last-write-wins */
  createdAt: number;
  /** Quantas vezes já tentamos drenar essa op */
  attempts: number;
  /** Última mensagem de erro (debug) */
  lastError?: string;
  /**
   * Quando o app pode tentar de novo (epoch ms). Usado pra exponential backoff
   * em erros semânticos. Erros de rede ignoram esse campo (drain para todo).
   */
  nextRetryAt?: number;
  /**
   * Marca op como "morta" — atingiu MAX_ATTEMPTS. Não tenta mais até o user
   * limpar ou editar manualmente em Settings.
   */
  failed?: boolean;
};

/** Limite de tentativas antes de marcar como `failed` */
const MAX_ATTEMPTS = 5;

/** Backoff: cada falha aumenta o delay base em (5s × 2^attempts) */
function nextBackoff(attempts: number): number {
  // 5s, 10s, 20s, 40s, 80s
  const baseMs = 5000;
  return Date.now() + baseMs * Math.pow(2, attempts);
}

let memoryCache: Operation[] | null = null;
const subscribers = new Set<() => void>();

function generateId(): string {
  // UUID v4 simplificado (não-crypto, mas suficiente pra IDs locais únicos)
  return 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

async function loadQueue(): Promise<Operation[]> {
  if (memoryCache !== null) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    memoryCache = raw ? (JSON.parse(raw) as Operation[]) : [];
  } catch (err) {
    console.warn('[offlineQueue] failed to load:', err);
    memoryCache = [];
  }
  return memoryCache;
}

async function saveQueue(queue: Operation[]): Promise<void> {
  memoryCache = queue;
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[offlineQueue] failed to save:', err);
  }
  subscribers.forEach((cb) => cb());
}

/**
 * Enfileira uma operação. Retorna o ID local da operação (pra UI conseguir
 * remover otimisticamente se o user desfizer antes do drain).
 */
export async function enqueue(
  op: Omit<Operation, 'id' | 'createdAt' | 'attempts'>
): Promise<string> {
  const queue = await loadQueue();
  const operation: Operation = {
    ...op,
    id: generateId(),
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(operation);
  await saveQueue(queue);
  return operation.id;
}

/**
 * Tenta executar UMA operação contra o Supabase.
 * Retorna true se sucesso, false se falhou (mantém na queue pra retry).
 */
async function executeOperation(op: Operation): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (op.op === 'insert') {
      const { error } = await supabase.from(op.table as any).insert(op.payload as any);
      if (error) return { success: false, error: error.message };
    } else if (op.op === 'upsert') {
      const { error } = await supabase.from(op.table as any).upsert(op.payload as any);
      if (error) return { success: false, error: error.message };
    } else if (op.op === 'update') {
      let q = supabase.from(op.table as any).update(op.payload as any);
      for (const [k, v] of Object.entries(op.filters ?? {})) {
        q = q.eq(k, v);
      }
      const { error } = await q;
      if (error) return { success: false, error: error.message };
    } else if (op.op === 'delete') {
      let q = supabase.from(op.table as any).delete();
      for (const [k, v] of Object.entries(op.filters ?? {})) {
        q = q.eq(k, v);
      }
      const { error } = await q;
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

/**
 * Drena a fila — tenta executar todas as operações pendentes em ordem (FIFO).
 *
 * Comportamento:
 * - Pula ops marcadas como `failed: true` (max attempts).
 * - Pula ops com `nextRetryAt > now` (backoff em curso).
 * - Para no primeiro erro de rede pra evitar perder o resto da fila.
 *
 * @returns número de operações drenadas com sucesso
 */
export async function drain(): Promise<number> {
  const queue = await loadQueue();
  if (queue.length === 0) return 0;

  let drained = 0;
  const remaining: Operation[] = [];
  const now = Date.now();
  let networkErrorHit = false;

  for (let i = 0; i < queue.length; i++) {
    const op = queue[i];

    // Op morta — mantém na fila pra debug, mas não tenta
    if (op.failed) {
      remaining.push(op);
      continue;
    }

    // Já hit erro de rede — não tenta o resto, só passa adiante
    if (networkErrorHit) {
      remaining.push(op);
      continue;
    }

    // Backoff em curso? Pula essa op e passa pra próxima
    if (op.nextRetryAt && op.nextRetryAt > now) {
      remaining.push(op);
      continue;
    }

    const result = await executeOperation(op);

    if (result.success) {
      drained++;
      continue;
    }

    const isNetworkError =
      result.error?.includes('Network') ||
      result.error?.includes('fetch') ||
      result.error?.includes('Failed to fetch') ||
      result.error?.includes('aborted');

    const newAttempts = op.attempts + 1;
    const reachedMax = newAttempts >= MAX_ATTEMPTS;

    if (isNetworkError) {
      // Rede caiu durante drain — para tudo e mantém em ordem
      remaining.push({
        ...op,
        attempts: newAttempts,
        lastError: result.error,
        // Sem backoff em network error — quando voltar online, drena tudo
      });
      networkErrorHit = true;
      continue;
    }

    // Erro semântico (RLS, FK, validação, etc)
    if (reachedMax) {
      remaining.push({
        ...op,
        attempts: newAttempts,
        lastError: result.error,
        failed: true,
      });
    } else {
      remaining.push({
        ...op,
        attempts: newAttempts,
        lastError: result.error,
        nextRetryAt: nextBackoff(newAttempts),
      });
    }
  }

  await saveQueue(remaining);
  return drained;
}

/**
 * Retorna o status atual da fila (sem drenar).
 */
export async function getStatus(): Promise<{
  /** Total na fila (pendentes + falhas) */
  count: number;
  /** Operações ativas aguardando replay (excluindo failed) */
  pending: number;
  /** Operações que atingiram MAX_ATTEMPTS — precisam atenção manual */
  failed: number;
  /** ms desde a operação mais antiga */
  oldestAge: number | null;
}> {
  const queue = await loadQueue();
  if (queue.length === 0) {
    return { count: 0, pending: 0, failed: 0, oldestAge: null };
  }

  const failed = queue.filter((op) => op.failed).length;
  const pending = queue.length - failed;

  const oldest = queue.reduce(
    (min, op) => (op.createdAt < min ? op.createdAt : min),
    queue[0].createdAt,
  );

  return {
    count: queue.length,
    pending,
    failed,
    oldestAge: Date.now() - oldest,
  };
}

/**
 * Versão sync do count, usada pelo banner UI (acessa só o memoryCache).
 * Pode retornar 0 antes do primeiro load — não é problema.
 */
export function getCountSync(): number {
  return memoryCache?.length ?? 0;
}

/**
 * Limpa a fila (não recomendado em produção — usar só em settings de debug).
 */
export async function clearQueue(): Promise<void> {
  await saveQueue([]);
}

/**
 * Lista as operações da fila (pra debug/UI).
 */
export async function listOperations(): Promise<Operation[]> {
  return [...(await loadQueue())];
}

/**
 * Remove uma operação específica da fila por ID.
 * Útil se o user desfaz uma ação enquanto offline.
 */
export async function removeOperation(id: string): Promise<void> {
  const queue = await loadQueue();
  const next = queue.filter((op) => op.id !== id);
  if (next.length !== queue.length) {
    await saveQueue(next);
  }
}

/**
 * Reseta os contadores de uma op que falhou (failed=true ou backoff).
 * Próximo drain vai tentar de novo do zero.
 */
export async function retryOperation(id: string): Promise<void> {
  const queue = await loadQueue();
  const next = queue.map((op) =>
    op.id === id
      ? { ...op, attempts: 0, failed: false, nextRetryAt: undefined, lastError: undefined }
      : op,
  );
  await saveQueue(next);
}

/**
 * Subscreve a mudanças na queue (pra UI que mostra contador).
 */
export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
