/**
 * Otimização de roteiro por proximidade.
 *
 * Dado um conjunto de lugares com lat/lng, reorganiza a ordem usando
 * algoritmo nearest-neighbor (greedy):
 *   1. Começa pelo primeiro lugar (mantém âncora — geralmente o primeiro da manhã)
 *   2. Próximo = lugar mais próximo do atual (não visitado)
 *   3. Repete até cobrir todos
 *
 * Não é o ótimo global (TSP é NP-hard) mas é bom o suficiente para 3-10 lugares
 * que é o tamanho típico de um dia de viagem. Para um dia com 20 lugares,
 * a diferença pro ótimo real costuma ser <15% da distância total.
 *
 * Também recalcula `start_time` baseado em:
 *   - Hora inicial preservada do primeiro lugar
 *   - Adiciona duration_minutes + tempo estimado de deslocamento por distância
 */

export type Coord = {
  latitude: number;
  longitude: number;
};

/**
 * Distância em km entre dois pontos (fórmula de haversine).
 * Boa o suficiente pra ordenação — não precisa precisão extrema.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371; // raio da Terra em km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ordena lugares por proximidade (nearest-neighbor a partir do primeiro).
 *
 * Lugares **sem coordenadas** são mantidos no final, na ordem original.
 *
 * @param items Lista com lat/lng (pode ser null)
 * @param anchorIndex Índice do lugar âncora (default 0 — primeiro da lista)
 * @returns Nova lista reordenada
 */
export function sortByProximity<
  T extends { latitude: number | null; longitude: number | null },
>(items: T[], anchorIndex = 0): T[] {
  if (items.length <= 1) return items;

  // Separa quem tem coord de quem não tem
  const withCoord: T[] = [];
  const withoutCoord: T[] = [];
  for (const it of items) {
    if (it.latitude !== null && it.longitude !== null) {
      withCoord.push(it);
    } else {
      withoutCoord.push(it);
    }
  }

  if (withCoord.length <= 1) {
    return [...withCoord, ...withoutCoord];
  }

  // Âncora: o anchorIndex original, mas só se ele estiver no withCoord
  // Caso contrário, começa pelo primeiro com coord
  const ordered: T[] = [];
  const remaining = [...withCoord];

  // Encontra a âncora no remaining (busca pela igualdade de objeto, não índice)
  const originalAnchor = items[anchorIndex];
  let anchorPos = remaining.indexOf(originalAnchor);
  if (anchorPos === -1) anchorPos = 0;

  ordered.push(remaining.splice(anchorPos, 1)[0]);

  // Greedy: a cada passo, encontra o mais próximo do último adicionado
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastCoord: Coord = {
      latitude: last.latitude as number,
      longitude: last.longitude as number,
    };

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      const dist = haversineKm(lastCoord, {
        latitude: r.latitude as number,
        longitude: r.longitude as number,
      });
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  // Lugares sem coord vão no final
  return [...ordered, ...withoutCoord];
}

/**
 * Calcula o total de distância percorrida num dia (em km).
 * Útil pra mostrar pro user antes/depois da otimização.
 */
export function totalDistanceKm<
  T extends { latitude: number | null; longitude: number | null },
>(items: T[]): number {
  let total = 0;
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    if (
      a.latitude === null ||
      a.longitude === null ||
      b.latitude === null ||
      b.longitude === null
    ) {
      continue;
    }
    total += haversineKm(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    );
  }
  return total;
}

/**
 * Recalcula start_times de uma lista ordenada.
 *
 * Estratégia:
 * - Primeiro item mantém seu start_time original (ou usa o `defaultStart` se for null)
 * - Cada próximo = anterior + duration + tempo de deslocamento estimado
 * - Tempo de deslocamento: 5 min base + 3 min por km (a pé / transit casual)
 *
 * Não modifica os objetos; retorna novos com `start_time` ajustado.
 */
export function recomputeStartTimes<
  T extends {
    latitude: number | null;
    longitude: number | null;
    start_time: string | null;
    duration_minutes: number | null;
  },
>(items: T[], defaultStart = '09:00'): T[] {
  if (items.length === 0) return items;

  const result: T[] = [];

  // Hora inicial: do primeiro item, senão default
  let currentMinutes = parseHHMM(items[0].start_time ?? defaultStart);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const newTime = formatHHMM(currentMinutes);
    result.push({ ...item, start_time: newTime });

    // Próxima hora = atual + duração + deslocamento
    const duration = item.duration_minutes ?? 60; // default 1h se não tem
    let travelMinutes = 0;

    const next = items[i + 1];
    if (next) {
      if (
        item.latitude !== null &&
        item.longitude !== null &&
        next.latitude !== null &&
        next.longitude !== null
      ) {
        const distKm = haversineKm(
          { latitude: item.latitude, longitude: item.longitude },
          { latitude: next.latitude, longitude: next.longitude },
        );
        travelMinutes = Math.round(5 + distKm * 3);
      } else {
        travelMinutes = 15; // default se não dá pra calcular
      }
    }

    currentMinutes += duration + travelMinutes;
    // Cap em 23:30 (não deixa rolar pra próximo dia)
    if (currentMinutes > 23 * 60 + 30) currentMinutes = 23 * 60 + 30;
  }

  return result;
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
