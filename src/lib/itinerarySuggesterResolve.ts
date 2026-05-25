import { searchPlaces, type SearchResult } from '@/lib/places';
import type { SuggestedItem } from '@/lib/itinerarySuggester';

/**
 * Resolve nomes sugeridos pela IA em SearchResult (com lat/lng) via OSM/Nominatim.
 *
 * Como o Nominatim tem rate limit de 1 req/segundo, este resolver:
 * - Faz requests **sequenciais** com delay de 1.1s entre elas
 * - Retorna progress callback pra UI mostrar quantos lugares já foram resolvidos
 * - Se um lugar falhar, marca como `resolved: false` e segue (não trava o batch)
 *
 * O caller pode escolher:
 * - Aceitar só os resolvidos (lugares com coordenadas reais)
 * - Aceitar todos (não resolvidos viram custom_title sem coordenadas)
 */

export type ResolvedSuggestedItem = SuggestedItem & {
  resolved: boolean;
  /** SearchResult do OSM se foi resolvido com sucesso */
  searchResult?: SearchResult;
};

/** Delay entre requests pro Nominatim (cumprir TOS de 1 req/s) */
const NOMINATIM_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve uma lista de itens em paralelo (com rate limiting sequencial).
 *
 * @param items Lista de itens sugeridos
 * @param destination Cidade/país do destino (usado pra desambiguar nomes comuns)
 * @param onProgress Callback chamado a cada item resolvido (atual, total)
 */
export async function resolveSuggestedPlaces(
  items: SuggestedItem[],
  destination: string,
  onProgress?: (resolved: number, total: number) => void,
): Promise<ResolvedSuggestedItem[]> {
  const results: ResolvedSuggestedItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Query: nome + destino pra desambiguar
    // Ex: "Mercado da Ribeira Lisboa" em vez de só "Mercado da Ribeira"
    const query = `${item.name} ${destination}`;

    let searchResult: SearchResult | undefined;
    let resolved = false;

    try {
      const matches = await searchPlaces(query);
      if (matches.length > 0) {
        searchResult = matches[0]; // primeiro resultado costuma ser o melhor
        resolved = true;
      }
    } catch {
      // Falha de rede ou rate limit — segue como não resolvido
    }

    results.push({
      ...item,
      resolved,
      searchResult,
    });

    onProgress?.(i + 1, items.length);

    // Delay antes do próximo (exceto se for o último)
    if (i < items.length - 1) {
      await sleep(NOMINATIM_DELAY_MS);
    }
  }

  return results;
}

/**
 * Variante resolvendo em batch: todos os itens de TODOS os dias de uma vez.
 * Retorna os mesmos `days` mas com itens contendo `searchResult` quando possível.
 */
export async function resolveSuggestedDays<T extends { items: SuggestedItem[] }>(
  days: T[],
  destination: string,
  onProgress?: (resolved: number, total: number) => void,
): Promise<Array<T & { items: ResolvedSuggestedItem[] }>> {
  const total = days.reduce((sum, d) => sum + d.items.length, 0);
  let resolvedCount = 0;

  const result: Array<T & { items: ResolvedSuggestedItem[] }> = [];

  for (const day of days) {
    // Não passa o onProgress local — controlamos o contador agregado aqui
    const resolvedItems: ResolvedSuggestedItem[] = [];
    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      const query = `${item.name} ${destination}`;
      let searchResult: SearchResult | undefined;
      let resolved = false;
      try {
        const matches = await searchPlaces(query);
        if (matches.length > 0) {
          searchResult = matches[0];
          resolved = true;
        }
      } catch {
        // sem-op
      }
      resolvedItems.push({ ...item, resolved, searchResult });
      resolvedCount++;
      onProgress?.(resolvedCount, total);

      // Delay antes do próximo item (incluindo entre dias)
      if (resolvedCount < total) {
        await sleep(NOMINATIM_DELAY_MS);
      }
    }

    result.push({
      ...day,
      items: resolvedItems,
    });
  }

  return result;
}
