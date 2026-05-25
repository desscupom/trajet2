import { enqueue } from '@/lib/offlineQueue';
import {
  getOnlineStatus,
  pingNow,
  reportNetworkFailure,
  reportNetworkSuccess,
} from '@/hooks/useOnlineStatus';
import { supabase } from '@/lib/supabase';

/**
 * Wrapper offline-aware sobre o Supabase client.
 *
 * Comportamento:
 * - Se online: executa direto (mesma performance do supabase puro).
 * - Se offline: enfileira a mutation pra replay quando voltar a ficar online.
 * - Se "online" mas erro de rede: pinga pra rechecar status e enfileira se confirmar offline.
 *
 * IMPORTANTE: ao enfileirar, retornamos `{ data: null, error: null, queued: true }`.
 * O caller pode tratar isso como sucesso otimista.
 *
 * NÃO usar pra:
 * - Storage uploads (precisa do binário, não dá pra serializar bem)
 * - RPC calls (auth.signUp, accept_trip_invite, etc — precisam de net pra rodar)
 * - Selects (não tem o que enfileirar — apenas falha)
 */

export type QueuedResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
  /** true se a operação foi pra fila offline */
  queued: boolean;
};

/**
 * Detecta se o erro retornado pelo Supabase indica falha de rede
 * (vs erro semântico tipo RLS rejeitando, validação, etc).
 */
function isNetworkErrorMessage(msg: string | undefined): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch') ||
    lower.includes('aborted') ||
    lower.includes('timeout')
  );
}

async function tryOrQueue(
  fn: () => Promise<{ data: any; error: any }>,
  enqueueFn: () => Promise<string>
): Promise<QueuedResult<any>> {
  // Se já sabemos que está offline, vai direto pra queue
  if (!getOnlineStatus()) {
    await enqueueFn();
    return { data: null, error: null, queued: true };
  }

  // Tenta executar online
  const result = await fn();
  if (!result.error) {
    // Sucesso = reseta contador de falhas (volta online se estava offline)
    reportNetworkSuccess();
    return { ...result, queued: false };
  }

  // Se deu erro, é rede ou semântico?
  if (isNetworkErrorMessage(result.error.message)) {
    // Confirma com ping antes de enfileirar (evita falso positivo)
    const stillOnline = await pingNow();
    if (!stillOnline) {
      reportNetworkFailure();
      await enqueueFn();
      return { data: null, error: null, queued: true };
    }
    // Ping passou — provavelmente erro transitório. Repassa erro.
    return { ...result, queued: false };
  }

  // Erro semântico (RLS, FK, etc) — repassa pro caller decidir
  // (não conta como falha de rede)
  reportNetworkSuccess();
  return { ...result, queued: false };
}

/**
 * API pública. Use como `supabaseQueued.from('tasks').insert({...})`.
 *
 * Comparado ao supabase original:
 * - Sempre retorna `QueuedResult` (com flag `queued`).
 * - select() chains não são suportados aqui — use o supabase puro pra leitura.
 * - O retorno NÃO inclui dados quando queued=true (não temos resposta do servidor).
 */
export const supabaseQueued = {
  from(table: string) {
    return {
      /**
       * INSERT — payload pode ser um objeto ou array de objetos.
       */
      async insert(payload: Record<string, any> | Record<string, any>[]): Promise<QueuedResult> {
        return tryOrQueue(
          async () => {
            const r = await supabase.from(table as any).insert(payload as any);
            return { data: r.data, error: r.error };
          },
          () => enqueue({ table, op: 'insert', payload: payload as any })
        );
      },

      /**
       * UPSERT — payload pode ser um objeto ou array de objetos.
       */
      async upsert(payload: Record<string, any> | Record<string, any>[]): Promise<QueuedResult> {
        return tryOrQueue(
          async () => {
            const r = await supabase.from(table as any).upsert(payload as any);
            return { data: r.data, error: r.error };
          },
          () => enqueue({ table, op: 'upsert', payload: payload as any })
        );
      },

      /**
       * UPDATE com filtros .eq(). Pra um único campo:
       * `supabaseQueued.from('tasks').update({ done: true }).eq('id', 'abc')`
       */
      update(payload: Record<string, any>) {
        const filters: Record<string, any> = {};
        const builder = {
          eq(col: string, value: any) {
            filters[col] = value;
            return builder;
          },
          async run(): Promise<QueuedResult> {
            return tryOrQueue(
              async () => {
                let q = supabase.from(table as any).update(payload as any);
                for (const [k, v] of Object.entries(filters)) {
                  q = q.eq(k, v);
                }
                const r = await q;
                return { data: r.data, error: r.error };
              },
              () => enqueue({ table, op: 'update', payload, filters })
            );
          },
        };
        return builder;
      },

      /**
       * DELETE com filtros .eq(). Sempre exige pelo menos um eq pra evitar
       * acidentes (deletar tabela inteira).
       */
      delete() {
        const filters: Record<string, any> = {};
        const builder = {
          eq(col: string, value: any) {
            filters[col] = value;
            return builder;
          },
          async run(): Promise<QueuedResult> {
            if (Object.keys(filters).length === 0) {
              return {
                data: null,
                error: { message: 'DELETE without filters is not allowed' },
                queued: false,
              };
            }
            return tryOrQueue(
              async () => {
                let q = supabase.from(table as any).delete();
                for (const [k, v] of Object.entries(filters)) {
                  q = q.eq(k, v);
                }
                const r = await q;
                return { data: r.data, error: r.error };
              },
              () => enqueue({ table, op: 'delete', filters })
            );
          },
        };
        return builder;
      },
    };
  },
};
