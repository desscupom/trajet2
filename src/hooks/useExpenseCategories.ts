import { useCallback, useEffect, useState } from 'react';

import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { EXPENSE_CATEGORIES } from '@/lib/expenses';
import { supabase } from '@/lib/supabase';
import { supabaseQueued } from '@/lib/supabaseQueued';

export type CategoryOption = {
  /** Identificador único: built-in (ex: 'lodging') ou slug custom (ex: 'souvenirs') */
  value: string;
  /** Label de exibição */
  label: string;
  /** Nome do ícone Lucide (export de @/components/Icon) */
  iconName: string;
  /** true se é categoria customizada da viagem (não built-in) */
  isCustom: boolean;
};

const BUILT_IN_OPTIONS: CategoryOption[] = EXPENSE_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.label,
  iconName: c.iconName,
  isCustom: false,
}));

/**
 * Retorna a lista combinada de categorias pra uma viagem:
 * built-in primeiro + customs depois (em ordem alfabética).
 *
 * Atualiza em tempo real quando outro membro cria/deleta uma custom.
 */
export function useExpenseCategories(tripId: string | null): {
  categories: CategoryOption[];
  loading: boolean;
  refetch: () => void;
} {
  const [customs, setCustoms] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustoms = useCallback(async () => {
    if (!tripId) {
      setCustoms([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('expense_categories')
      .select('slug, label, icon_name')
      .eq('trip_id', tripId)
      .order('label');

    if (error) {
      console.warn('[useExpenseCategories] erro:', error.message);
      setCustoms([]);
    } else {
      setCustoms(
        (data ?? []).map((row) => ({
          value: row.slug,
          label: row.label,
          iconName: row.icon_name,
          isCustom: true,
        }))
      );
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchCustoms();
  }, [fetchCustoms]);

  useRealtimeTable({
    table: 'expense_categories',
    filter: tripId ? `trip_id=eq.${tripId}` : undefined,
    onChange: fetchCustoms,
    enabled: !!tripId,
  });

  return {
    categories: [...BUILT_IN_OPTIONS, ...customs],
    loading,
    refetch: fetchCustoms,
  };
}

/**
 * Cria categoria custom. Gera slug a partir do label (lowercase, sem acentos, sem espaços).
 * Retorna { error: string | null } pra ser tratado pelo caller.
 */
export async function createCustomCategory(
  tripId: string,
  label: string,
  iconName: string,
  userId: string,
): Promise<{ slug: string | null; error: string | null; queued?: boolean }> {
  const trimmed = label.trim();
  if (trimmed.length < 2) {
    return { slug: null, error: 'Nome curto demais.' };
  }

  const slug = slugify(trimmed);
  if (slug.length < 2) {
    return { slug: null, error: 'Nome inválido.' };
  }

  const { error, queued } = await supabaseQueued
    .from('expense_categories')
    .insert({
      trip_id: tripId,
      slug,
      label: trimmed,
      icon_name: iconName,
      created_by: userId,
    });

  if (error) {
    // Postgres error code 23505 = unique violation
    if ((error as any).code === '23505') {
      return { slug: null, error: 'Já existe uma categoria com esse nome.' };
    }
    return { slug: null, error: error.message };
  }

  return { slug, error: null, queued };
}

/**
 * Slugify simples: lowercase + remove acentos + replace não-alfanum por '-'.
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
