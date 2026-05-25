// Cliente da API Nominatim (OpenStreetMap) para busca de lugares.
// É gratuito e não exige chave. Termos de uso: https://operations.osmfoundation.org/policies/nominatim/
//   - Limite de 1 req/segundo
//   - Identificar o app no User-Agent
//   - Cachear resultados quando possível (a gente faz isso ao salvar em `places`)

export type NominatimPlace = {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    borough?: string;
    district?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
    house_number?: string;
    shop?: string;
    amenity?: string;
  };
  extratags?: {
    wikidata?: string;
    wikipedia?: string;
    image?: string;
  };
};

export type SearchResult = {
  externalId: string; // place_id do OSM
  name: string;
  fullAddress: string;   // endereço completo para exibição
  neighborhood: string | null; // bairro/distrito
  latitude: number;
  longitude: number;
  category: string | null;
  photo_url: string | null; // foto via Wikimedia/OSM (quando disponível)
};

// Debounce simples — evita martelar a API a cada tecla.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSearchPlaces(
  query: string,
  delayMs: number,
  callback: (results: SearchResult[]) => void
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchPlaces(query).then(callback).catch(() => callback([]));
  }, delayMs);
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: 'json',
    addressdetails: '1',
    extratags: '1',
    limit: '10',
    'accept-language': 'pt-BR,pt,en',
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      // Identificação obrigatória pela política do Nominatim
      'User-Agent': 'Trajet/0.1 (travel-planner)',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim retornou ${response.status}`);
  }

  const data: NominatimPlace[] = await response.json();

  return data.map((place) => {
    const a = place.address ?? {};

    // Nome principal — primeira parte do display_name se não vier no campo name
    const shortName = place.name || place.display_name.split(', ')[0];

    // Bairro/distrito: tenta várias chaves do mais específico ao mais geral
    const neighborhood =
      a.neighbourhood ||
      a.suburb ||
      a.quarter ||
      a.borough ||
      a.district ||
      a.city_district ||
      null;

    // Cidade
    const city = a.city || a.town || a.village || a.municipality || a.county || null;

    // Rua (se houver)
    const road = a.road || a.pedestrian || a.footway || null;

    // Endereço completo para exibição — da mais específica pra mais geral
    // Ex: "Rua Florida, San Nicolás, Buenos Aires, Argentina"
    const addressParts = [road, neighborhood, city, a.country]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i); // remove duplicatas

    const fullAddress =
      addressParts.length > 0
        ? addressParts.join(', ')
        : place.display_name;

    // Foto: preferência para extratags.image (link Wikimedia direto)
    // Fallback: foto de categoria genérica por emoji (tratada na UI)
    const photo_url = place.extratags?.image || null;

    return {
      externalId: `osm:${place.place_id}`,
      name: shortName,
      fullAddress,
      neighborhood,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
      category: humanizeCategory(place.class, place.type),
      photo_url,
    };
  });
}

function humanizeCategory(cls: string, type: string): string | null {
  const map: Record<string, string> = {
    restaurant: 'Restaurante',
    cafe: 'Café',
    bar: 'Bar',
    fast_food: 'Fast food',
    hotel: 'Hotel',
    hostel: 'Hostel',
    museum: 'Museu',
    attraction: 'Atração',
    viewpoint: 'Mirante',
    park: 'Parque',
    beach: 'Praia',
    monument: 'Monumento',
    church: 'Igreja',
    cathedral: 'Catedral',
    castle: 'Castelo',
    market: 'Mercado',
    mall: 'Shopping',
    supermarket: 'Supermercado',
    airport: 'Aeroporto',
    train_station: 'Estação',
    bus_station: 'Rodoviária',
  };
  return map[type] || (cls === 'tourism' ? 'Atração' : null);
}

// ── Horários de funcionamento via OSM details ─────────────────────

export type OpeningHours = {
  raw: string | null;           // string bruta do OSM ("Mo-Fr 09:00-18:00")
  periods: DayPeriod[];         // períodos parseados
  todayLabel: string | null;    // "Hoje: 09:00–18:00" ou "Fechado hoje"
  opensAt: string | null;       // "09:00" (horário de abertura hoje)
  closesAt: string | null;      // "18:00" (horário de fechamento hoje)
  defaultDuration: number;      // duração padrão estimada em minutos
};

type DayPeriod = {
  days: number[];   // 0=Dom, 1=Seg, …, 6=Sab (ISO: 1=Seg)
  open: string;     // "09:00"
  close: string;    // "18:00"
};

const DAY_ABBREVIATIONS: Record<string, number[]> = {
  Mo: [1], Tu: [2], We: [3], Th: [4], Fr: [5], Sa: [6], Su: [0],
  'Mo-Fr': [1, 2, 3, 4, 5],
  'Mo-Sa': [1, 2, 3, 4, 5, 6],
  'Mo-Su': [0, 1, 2, 3, 4, 5, 6],
  'Sa-Su': [0, 6],
};

/** Duração padrão por categoria (minutos) */
const DEFAULT_DURATION: Record<string, number> = {
  Restaurante: 90,  Café: 45,  Bar: 90,  'Fast food': 30,
  Museu: 120,  Atração: 90,  Mirante: 45,  Parque: 60,
  Praia: 180,  Monumento: 30,  Igreja: 30,  Catedral: 45,
  Castelo: 90,  Mercado: 60,  Shopping: 120,  Supermercado: 30,
};

/** Busca horários de funcionamento pelo OSM place_id */
export async function fetchOpeningHours(
  externalId: string,
  category: string | null,
): Promise<OpeningHours> {
  const empty: OpeningHours = {
    raw: null, periods: [], todayLabel: null,
    opensAt: null, closesAt: null,
    defaultDuration: DEFAULT_DURATION[category ?? ''] ?? 60,
  };

  try {
    // Extrai OSM id numérico
    const osmId = externalId.replace('osm:', '');
    const url = `https://nominatim.openstreetmap.org/details.php?place_id=${osmId}&format=json&addressdetails=0&keywords=0&linkedplaces=0&hierarchy=0&group_hierarchy=0&polygon_geojson=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Trajet/0.1 (travel-planner)' },
    });
    if (!res.ok) return empty;

    const data = await res.json();
    const rawHours: string | null = data?.extratags?.opening_hours ?? null;
    if (!rawHours) return { ...empty, defaultDuration: DEFAULT_DURATION[category ?? ''] ?? 60 };

    const periods = parseOpeningHours(rawHours);
    const todayDow = new Date().getDay(); // 0=Dom
    const todayPeriod = periods.find((p) => p.days.includes(todayDow));

    return {
      raw: rawHours,
      periods,
      todayLabel: todayPeriod
        ? `Hoje: ${todayPeriod.open}–${todayPeriod.close}`
        : rawHours.toLowerCase().includes('24/7')
          ? 'Aberto 24h'
          : 'Horário não disponível',
      opensAt: todayPeriod?.open ?? null,
      closesAt: todayPeriod?.close ?? null,
      defaultDuration: DEFAULT_DURATION[category ?? ''] ?? 60,
    };
  } catch {
    return empty;
  }
}

/** Parser simplificado de strings opening_hours do OSM */
function parseOpeningHours(raw: string): DayPeriod[] {
  if (!raw) return [];
  if (raw.trim() === '24/7') {
    return [{ days: [0, 1, 2, 3, 4, 5, 6], open: '00:00', close: '23:59' }];
  }

  const periods: DayPeriod[] = [];
  // Divide por ";" para múltiplas regras
  for (const rule of raw.split(';')) {
    const trimmed = rule.trim();
    // Padrão: "Mo-Fr 09:00-18:00" ou "Sa 10:00-15:00"
    const match = trimmed.match(/^([A-Za-z\-,\s]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;

    const [, daysPart, open, close] = match;

    // Resolve os dias
    const dayKey = daysPart.trim().replace(/\s+/g, '');
    const days: number[] = DAY_ABBREVIATIONS[dayKey] ?? [];
    if (days.length > 0) {
      periods.push({ days, open, close });
    }
  }
  return periods;
}

// ── Sugestão de horário inteligente ──────────────────────────────

export type ScheduledItem = {
  id: string;
  start_time: string | null;  // "HH:MM:SS" ou "HH:MM"
  duration_minutes: number | null;
};

type TimeSlot = { start: string; end: string };

/** Sugere o melhor horário para um novo lugar, dados os itens já no dia */
export function suggestBestTime(
  existingItems: ScheduledItem[],
  openingHours: OpeningHours,
  duration: number,
): { time: string; reason: string } {
  // Converte itens existentes para intervalos em minutos desde meia-noite
  const busySlots: { start: number; end: number }[] = existingItems
    .filter((it) => it.start_time)
    .map((it) => {
      const [h, m] = (it.start_time!).split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + (it.duration_minutes ?? 60);
      return { start: startMin, end: endMin };
    })
    .sort((a, b) => a.start - b.start);

  // Define janela de funcionamento (padrão: 09:00–21:00 se não houver info)
  const [openH, openM] = (openingHours.opensAt ?? '09:00').split(':').map(Number);
  const [closeH, closeM] = (openingHours.closesAt ?? '21:00').split(':').map(Number);
  const windowStart = openH * 60 + openM;
  const windowEnd = closeH * 60 + closeM;

  const minToStr = (min: number): string => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Se não há itens, sugere abertura + 30min (tempo de deslocamento)
  if (busySlots.length === 0) {
    const suggested = Math.max(windowStart, 9 * 60) + 30;
    return {
      time: minToStr(Math.min(suggested, windowEnd - duration)),
      reason: openingHours.opensAt
        ? `Abre às ${openingHours.opensAt}`
        : 'Horário sugerido para o início do dia',
    };
  }

  // Tenta encontrar espaço ANTES do primeiro item
  const firstItem = busySlots[0];
  const beforeGap = firstItem.start - windowStart;
  if (beforeGap >= duration + 30) {
    return {
      time: minToStr(windowStart + 15),
      reason: 'Antes do primeiro compromisso do dia',
    };
  }

  // Procura gaps ENTRE itens existentes
  for (let i = 0; i < busySlots.length - 1; i++) {
    const gapStart = busySlots[i].end + 15; // +15min de deslocamento
    const gapEnd = busySlots[i + 1].start;
    if (gapEnd - gapStart >= duration) {
      return {
        time: minToStr(gapStart),
        reason: `Encaixa entre ${minToStr(busySlots[i].start)} e ${minToStr(busySlots[i + 1].start)}`,
      };
    }
  }

  // Depois do último item
  const lastEnd = busySlots[busySlots.length - 1].end + 15;
  if (lastEnd + duration <= windowEnd) {
    return {
      time: minToStr(lastEnd),
      reason: 'Depois do último compromisso',
    };
  }

  // Fallback: após o último independente do horário de fechamento
  return {
    time: minToStr(lastEnd),
    reason: 'Atenção: pode conflitar com horário de fechamento',
  };
}
