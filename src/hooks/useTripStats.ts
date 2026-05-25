import { useCallback, useEffect, useState } from 'react';

import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { datesBetween } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

export type TripStats = {
  daysCount: number;
  placesCount: number;
  expensesTotal: number;
  tasksCount: number;
  tasksDoneCount: number;
};

/**
 * Carrega contadores de uma viagem pra mostrar no hero.
 * Reage a mudanças via realtime.
 */
export function useTripStats(
  tripId: string,
  startDate: string | null,
  endDate: string | null,
  baseCurrency: string
) {
  const [stats, setStats] = useState<TripStats>({
    daysCount: 0,
    placesCount: 0,
    expensesTotal: 0,
    tasksCount: 0,
    tasksDoneCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const daysCount =
      startDate && endDate ? datesBetween(startDate, endDate).length : 0;

    const [placesResult, expensesResult, tasksResult, tasksDoneResult] =
      await Promise.all([
        supabase
          .from('places')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId),
        supabase
          .from('expenses')
          .select('amount_in_base')
          .eq('trip_id', tripId),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId)
          .eq('done', true),
      ]);

    const expensesTotal =
      expensesResult.data?.reduce((sum, e) => sum + (e.amount_in_base || 0), 0) ??
      0;

    setStats({
      daysCount,
      placesCount: placesResult.count ?? 0,
      expensesTotal,
      tasksCount: tasksResult.count ?? 0,
      tasksDoneCount: tasksDoneResult.count ?? 0,
    });
    setLoading(false);
  }, [tripId, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Realtime: refetch quando muda algo nas tabelas relacionadas
  useRealtimeTable({
    table: 'places',
    filter: `trip_id=eq.${tripId}`,
    onChange: fetchStats,
  });
  useRealtimeTable({
    table: 'expenses',
    filter: `trip_id=eq.${tripId}`,
    onChange: fetchStats,
  });
  useRealtimeTable({
    table: 'tasks',
    filter: `trip_id=eq.${tripId}`,
    onChange: fetchStats,
  });

  return { stats, loading };
}
