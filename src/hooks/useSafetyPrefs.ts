import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { type SafetyAlertType, SAFETY_ALERT_LABELS } from '@/hooks/usePlaceSafety';

export type SafetyPrefs = Record<SafetyAlertType, boolean>;

export const DEFAULT_SAFETY_PREFS: SafetyPrefs = {
  unsafe_women:          true,
  unsafe_children:       false,
  unsafe_night:          true,
  unsafe_lgbtq:          false,
  unsafe_general:        true,
  scam:                  true,
  poor_accessibility:    false,
  overcrowded:           false,
  closed_permanently:    true,
  different_from_photos: false,
};

export function useSafetyPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<SafetyPrefs>(DEFAULT_SAFETY_PREFS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('safety_alert_prefs')
      .eq('id', userId)
      .single();
    if (data?.safety_alert_prefs) {
      setPrefs({ ...DEFAULT_SAFETY_PREFS, ...data.safety_alert_prefs });
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newPrefs: SafetyPrefs) => {
    if (!userId) return;
    setPrefs(newPrefs);
    await supabase
      .from('profiles')
      .update({ safety_alert_prefs: newPrefs })
      .eq('id', userId);
  }, [userId]);

  const toggle = useCallback(async (type: SafetyAlertType) => {
    const newPrefs = { ...prefs, [type]: !prefs[type] };
    await save(newPrefs);
  }, [prefs, save]);

  return { prefs, loading, toggle, save, reload: load };
}
