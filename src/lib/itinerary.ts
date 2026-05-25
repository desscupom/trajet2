import { supabase } from '@/lib/supabase';

// Atualiza a posição de múltiplos itens em batch.
// Usamos uma promise array porque o Supabase não tem upsert múltiplo simples
// que respeite o trigger de RLS sem reescrever a row inteira.
export async function reorderItineraryItems(
  ids: string[]
): Promise<{ error: Error | null }> {
  // Faz updates em paralelo. Cada item recebe sua nova position pelo índice.
  const updates = ids.map((id, position) =>
    supabase.from('itinerary_items').update({ position }).eq('id', id)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error)?.error;

  return { error: firstError ? new Error(firstError.message) : null };
}

/**
 * Move um itinerary_item pra outro dia.
 * Coloca no fim do dia destino (calcula a próxima position).
 */
export async function moveItemToDay(
  itemId: string,
  targetDayId: string
): Promise<{ error: Error | null }> {
  // Conta quantos itens já tem no dia destino pra colocar no fim
  const { count, error: countError } = await supabase
    .from('itinerary_items')
    .select('id', { count: 'exact', head: true })
    .eq('trip_day_id', targetDayId);

  if (countError) return { error: new Error(countError.message) };

  const { error } = await supabase
    .from('itinerary_items')
    .update({
      trip_day_id: targetDayId,
      position: count ?? 0,
    })
    .eq('id', itemId);

  return { error: error ? new Error(error.message) : null };
}

/**
 * Atualiza o horário (start_time) de um item.
 * Aceita string formato 'HH:MM' ou null pra remover.
 */
export async function updateItemTime(
  itemId: string,
  startTime: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('itinerary_items')
    .update({ start_time: startTime })
    .eq('id', itemId);
  return { error: error ? new Error(error.message) : null };
}

