import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SafetyAlertType =
  | 'unsafe_women'
  | 'unsafe_children'
  | 'unsafe_night'
  | 'unsafe_lgbtq'
  | 'unsafe_general'
  | 'scam'
  | 'poor_accessibility'
  | 'overcrowded'
  | 'closed_permanently'
  | 'different_from_photos';

export const SAFETY_ALERT_LABELS: Record<SafetyAlertType, { label: string; icon: string; color: string }> = {
  unsafe_women:         { label: 'Risco para mulheres',        icon: '⚠️', color: '#ef4444' },
  unsafe_children:      { label: 'Não recomendado para crianças', icon: '🚸', color: '#f97316' },
  unsafe_night:         { label: 'Perigoso à noite',           icon: '🌙', color: '#8b5cf6' },
  unsafe_lgbtq:         { label: 'Risco para LGBTQIA+',        icon: '🏳️‍🌈', color: '#ef4444' },
  unsafe_general:       { label: 'Risco geral de segurança',   icon: '🚨', color: '#ef4444' },
  scam:                 { label: 'Golpe / roubo de turistas',  icon: '🎭', color: '#f97316' },
  poor_accessibility:   { label: 'Baixa acessibilidade',       icon: '♿', color: '#6b7280' },
  overcrowded:          { label: 'Superlotado',                 icon: '👥', color: '#3b82f6' },
  closed_permanently:   { label: 'Fechado permanentemente',    icon: '🔒', color: '#6b7280' },
  different_from_photos:{ label: 'Diferente das fotos',        icon: '📷', color: '#f59e0b' },
};

export const SEVERITY_LABELS = {
  1: { label: 'Aviso', color: '#f59e0b' },
  2: { label: 'Cuidado', color: '#f97316' },
  3: { label: 'Evitar', color: '#ef4444' },
} as const;

export type PlaceSafetyAlert = {
  id: string;
  place_id: string;
  place_name: string;
  alert_type: SafetyAlertType;
  description: string | null;
  severity: 1 | 2 | 3;
  reported_by: string;
  confirmed_count: number;
  expires_at: string | null;
  created_at: string;
  my_confirmation?: boolean;
};

export type PlaceSafetySummary = {
  max_severity: number;
  total_alerts: number;
  alert_types: SafetyAlertType[];
  total_confirmations: number;
};

export function usePlaceSafety(placeId: string, currentUserId: string | null) {
  const [alerts, setAlerts] = useState<PlaceSafetyAlert[]>([]);
  const [summary, setSummary] = useState<PlaceSafetySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!placeId) return;
    setLoading(true);
    try {
      const alertsRes = await (supabase as any)
        .from('place_safety_alerts')
        .select('*')
        .eq('place_id', placeId)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('severity', { ascending: false })
        .order('confirmed_count', { ascending: false });

      const summaryRes = await (supabase as any)
        .from('place_safety_summary')
        .select('max_severity,total_alerts,alert_types,total_confirmations')
        .eq('place_id', placeId)
        .maybeSingle();

      const alertData = alertsRes.data ?? [];

      let myConfs: string[] = [];
      if (currentUserId && alertData.length > 0) {
        const { data: confs } = await (supabase as any)
          .from('safety_alert_confirmations')
          .select('alert_id')
          .eq('user_id', currentUserId)
          .in('alert_id', alertData.map((a: any) => a.id));
        myConfs = (confs ?? []).map((c: any) => c.alert_id);
      }

      setAlerts(alertData.map((a: any) => ({
        ...a,
        my_confirmation: myConfs.includes(a.id),
      })));

      if (summaryRes.data) {
        setSummary({
          max_severity: summaryRes.data.max_severity ?? 0,
          total_alerts: summaryRes.data.total_alerts ?? 0,
          alert_types: summaryRes.data.alert_types ?? [],
          total_confirmations: summaryRes.data.total_confirmations ?? 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [placeId, currentUserId]);

  useEffect(() => { load(); }, [load]);

  const reportAlert = useCallback(async (
    input: {
      place_name: string;
      alert_type: SafetyAlertType;
      description?: string;
      severity: 1 | 2 | 3;
      expires_at?: string;
    }
  ): Promise<boolean> => {
    if (!currentUserId) return false;
    const { error } = await supabase.from('place_safety_alerts').insert({
      place_id: placeId,
      reported_by: currentUserId,
      ...input,
    });
    if (!error) await load();
    return !error;
  }, [placeId, currentUserId, load]);

  const toggleConfirmation = useCallback(async (alertId: string, currentlyConfirmed: boolean) => {
    if (!currentUserId) return;
    if (currentlyConfirmed) {
      await supabase.from('safety_alert_confirmations')
        .delete().eq('alert_id', alertId).eq('user_id', currentUserId);
    } else {
      await supabase.from('safety_alert_confirmations')
        .insert({ alert_id: alertId, user_id: currentUserId });
    }
    await load();
  }, [currentUserId, load]);

  return { alerts, summary, loading, reportAlert, toggleConfirmation, reload: load };
}
