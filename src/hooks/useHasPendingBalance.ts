import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

/**
 * Verifica se o usuário atual tem saldo pendente nessa viagem
 * (recebe ou deve algo). Retorna `true` se há divisão a acertar.
 *
 * Não calcula o valor exato — apenas indica se há algo a notificar.
 * Usado pra decidir se mostrar badge na tab de Despesas.
 *
 * Lógica simples:
 * - Soma dos shares onde member_id = user
 * - Soma dos amounts onde paid_by = user
 * - Se a diferença é ≠ 0 (com tolerância de 0,01) → tem saldo pendente
 */
export function useHasPendingBalance(tripId: string | null): boolean {
  const { user } = useAuth();
  const [hasPending, setHasPending] = useState(false);

  const check = useCallback(async () => {
    if (!user?.id || !tripId) {
      setHasPending(false);
      return;
    }

    const [paidResult, sharesResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount_in_base')
        .eq('trip_id', tripId)
        .eq('paid_by', user.id),
      supabase
        .from('expense_shares')
        .select('share_amount, expenses!inner(trip_id)')
        .eq('member_id', user.id)
        .eq('expenses.trip_id', tripId),
    ]);

    const totalPaid =
      paidResult.data?.reduce((sum, e) => sum + (e.amount_in_base ?? 0), 0) ?? 0;
    const totalOwed =
      sharesResult.data?.reduce((sum, s) => sum + (s.share_amount ?? 0), 0) ?? 0;

    const balance = totalPaid - totalOwed;
    setHasPending(Math.abs(balance) > 0.01);
  }, [user?.id, tripId]);

  useEffect(() => {
    check();
  }, [check]);

  return hasPending;
}
