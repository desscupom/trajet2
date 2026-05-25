import { Linking, Platform } from 'react-native';

/**
 * Abre o app de mapas externo (Google Maps ou Apple Maps) com uma rota
 * passando por vários pontos.
 *
 * Estratégia:
 * - Tenta primeiro o Google Maps via URL universal (funciona em iOS, Android e web)
 * - Funciona com até 9 waypoints + 1 destination final (limite do Google Maps URL)
 * - Se tiver só 1 ponto, abre como destino direto
 * - Modo de viagem padrão: walking (a pé) — pra roteiros turísticos faz sentido
 *
 * Limitação:
 * - O Google Maps URL não suporta "horário de partida" — só a rota geográfica
 * - iOS pode abrir no Apple Maps em vez do Google se Google Maps não tiver instalado
 */

export type RoutePoint = {
  latitude: number;
  longitude: number;
  /** Nome opcional pra usar em vez de coordenadas (algumas vezes funciona melhor) */
  name?: string;
};

/**
 * Constrói a URL do Google Maps Directions API (modo "navegação").
 *
 * Formato: https://www.google.com/maps/dir/?api=1
 *   &origin=...
 *   &destination=...
 *   &waypoints=...
 *   &travelmode=walking
 *
 * Referência: https://developers.google.com/maps/documentation/urls/get-started
 */
export function buildGoogleMapsRouteURL(
  points: RoutePoint[],
  travelMode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'walking',
): string | null {
  if (points.length === 0) return null;

  if (points.length === 1) {
    // Só 1 ponto: abre como destino, deixa o user escolher origem
    const p = points[0];
    return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=${travelMode}`;
  }

  // Múltiplos pontos:
  // - origin = primeiro
  // - destination = último
  // - waypoints = intermediários (max 9, separados por '|')
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).slice(0, 9); // máx 9 intermediários

  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: travelMode,
  });

  if (waypoints.length > 0) {
    const waypointsStr = waypoints
      .map((p) => `${p.latitude},${p.longitude}`)
      .join('|');
    params.append('waypoints', waypointsStr);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Abre o app de mapas com a rota traçada.
 * Retorna true se conseguiu abrir, false caso contrário.
 */
export async function openRouteInMaps(
  points: RoutePoint[],
  travelMode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'walking',
): Promise<boolean> {
  const url = buildGoogleMapsRouteURL(points, travelMode);
  if (!url) return false;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    // Fallback: tenta abrir mesmo assim — em alguns devices canOpenURL retorna
    // false mas o openURL ainda funciona
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.warn('Erro abrindo maps:', err);
    return false;
  }
}

/**
 * Helper pra extrair pontos válidos de uma lista de items do roteiro.
 * Filtra items sem coordenadas, mantém a ordem.
 */
export function extractRoutePoints<T extends {
  place?: { latitude?: number | null; longitude?: number | null; name?: string | null } | null;
}>(items: T[]): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const item of items) {
    const place = item.place;
    if (
      place &&
      place.latitude != null &&
      place.longitude != null &&
      isFinite(place.latitude) &&
      isFinite(place.longitude)
    ) {
      points.push({
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name ?? undefined,
      });
    }
  }
  return points;
}
