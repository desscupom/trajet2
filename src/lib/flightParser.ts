/**
 * Parser de voos em texto solto (email de reserva, captura de tela colada, etc).
 *
 * Estratégia:
 * - Regex em camadas, do mais específico (LATAM 3024) ao mais genérico
 * - Detecta múltiplos voos no mesmo texto (ida + volta, conexões)
 * - Retorna campos parciais quando não dá pra extrair tudo (ex: sem hora)
 *
 * Limitações:
 * - Não usa IA — só regex. Cobre os formatos mais comuns mas não todos.
 * - Datas são parseadas no formato BR (DD/MM/AAAA) e ISO (AAAA-MM-DD).
 *   Formato US (MM/DD/AAAA) ambíguo — assume BR sempre.
 * - Aeroportos: só extrai o código IATA (3 letras maiúsculas). Não traduz pra cidade.
 */

export type ParsedFlight = {
  /** Código da companhia + número do voo, ex: "LA3024", "G3 1234", "AD 4001" */
  flightCode: string | null;
  /** Companhia detectada (LATAM, Gol, Azul, Air France, etc) ou null */
  airline: string | null;
  /** Código IATA de origem (3 letras), ex: "GRU" */
  fromAirport: string | null;
  /** Código IATA de destino, ex: "MAD" */
  toAirport: string | null;
  /** Data de partida no formato YYYY-MM-DD */
  departureDate: string | null;
  /** Hora de partida no formato HH:MM */
  departureTime: string | null;
  /** Hora de chegada (opcional) */
  arrivalTime: string | null;
  /** Código de reserva / locator (ex: "ABC123") — opcional */
  reservationCode: string | null;
  /**
   * Texto inteiro do voo (linha original ou bloco).
   * Útil pra quando user quer revisar manualmente.
   */
  rawSnippet: string;
};

/** Mapeia prefixo IATA → nome amigável da companhia. */
const AIRLINE_MAP: Record<string, string> = {
  LA: 'LATAM',
  JJ: 'LATAM', // código antigo da TAM
  G3: 'GOL',
  AD: 'Azul',
  AA: 'American Airlines',
  UA: 'United',
  DL: 'Delta',
  AF: 'Air France',
  KL: 'KLM',
  LH: 'Lufthansa',
  IB: 'Iberia',
  BA: 'British Airways',
  TP: 'TAP',
  EK: 'Emirates',
  QR: 'Qatar',
  TK: 'Turkish',
  AC: 'Air Canada',
};

/**
 * Tenta detectar voos em um bloco de texto.
 * Retorna array (vazio se nada encontrado).
 *
 * Estratégia:
 * - Encontra todos os códigos de voo no texto
 * - Divide em "blocos" — do código atual até o próximo (ou fim do texto)
 * - Parseia cada bloco em isolamento (evita misturar horários entre voos)
 */
export function parseFlights(text: string): ParsedFlight[] {
  if (!text?.trim()) return [];

  const normalized = text.replace(/\r/g, '').trim();
  const flightCodeMatches = findAllFlightCodes(normalized);

  if (flightCodeMatches.length === 0) return [];

  const flights: ParsedFlight[] = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < flightCodeMatches.length; i++) {
    const match = flightCodeMatches[i];
    const flightCode = match.code;
    const blockKey = flightCode + '|' + match.position;
    if (seenCodes.has(blockKey)) continue;
    seenCodes.add(blockKey);

    // Bloco: do início desta linha até o início da linha do próximo voo
    // (ou fim do texto se for o último).
    const blockStart = normalized.lastIndexOf('\n', match.position) + 1;
    const nextMatch = flightCodeMatches[i + 1];
    const blockEnd = nextMatch
      ? normalized.lastIndexOf('\n', nextMatch.position) + 1
      : normalized.length;

    const snippet = normalized.slice(blockStart, blockEnd);
    const flight = parseFlightFromSnippet(snippet, flightCode);
    if (flight) flights.push(flight);
  }

  return flights;
}

/**
 * Encontra todos os códigos de voo num texto.
 * Padrões aceitos:
 * - LA3024, LA 3024, LA-3024 (2 letras maiúsculas + 1-4 dígitos)
 * - G3 1234 (2 chars + dígitos)
 *
 * Evita falsos positivos como "Q3" (trimestre), "MP3", etc.
 */
function findAllFlightCodes(text: string): { code: string; position: number }[] {
  const results: { code: string; position: number }[] = [];

  // Regex: 2 letras maiúsculas (com possível dígito no segundo char tipo G3),
  // possível separador (espaço/hífen), depois 1-4 dígitos.
  // Word boundaries pra evitar pegar partes de palavras.
  const regex = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b/g;

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const prefix = m[1];
    const number = m[2];
    // Filtra falsos positivos: airline prefix precisa ser conhecido OU
    // estar próximo de palavras-chave de voo
    const code = prefix + number;
    const isKnownAirline = AIRLINE_MAP[prefix] !== undefined;
    const hasFlightContext = hasFlightKeywordsNearby(text, m.index);

    if (isKnownAirline || hasFlightContext) {
      results.push({ code, position: m.index });
    }
  }

  return results;
}

/**
 * Procura por palavras-chave de voo num raio de ~150 chars do match.
 * Usado pra confirmar que um código tipo "AB1234" é mesmo um voo
 * (e não um número de pedido, código postal, etc).
 */
function hasFlightKeywordsNearby(text: string, position: number): boolean {
  const start = Math.max(0, position - 150);
  const end = Math.min(text.length, position + 150);
  const window = text.slice(start, end).toLowerCase();

  const keywords = [
    'voo', 'flight', 'embarque', 'boarding', 'partida', 'departure',
    'chegada', 'arrival', 'companhia', 'airline', 'aeroporto', 'airport',
    'portão', 'gate', 'reserva', 'booking', 'localizador', 'pnr',
    'check-in', 'checkin',
  ];

  return keywords.some((kw) => window.includes(kw));
}

/**
 * Parseia um snippet (bloco de um voo) e extrai os campos.
 */
function parseFlightFromSnippet(snippet: string, flightCode: string): ParsedFlight | null {
  const airlinePrefix = flightCode.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])/)?.[1] ?? null;
  const airline = airlinePrefix ? AIRLINE_MAP[airlinePrefix] ?? null : null;

  // Aeroportos: códigos IATA (3 letras maiúsculas isoladas)
  // Mas evita pegar partes de palavras como "GRU" em "GRUPO"
  const airportRegex = /\b([A-Z]{3})\b/g;
  const airportCandidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = airportRegex.exec(snippet)) !== null) {
    const code = m[1];
    if (!isLikelyAirportCode(code)) continue;
    airportCandidates.push(code);
  }
  // Primeiros 2 únicos: assume from → to
  const uniqueAirports = [...new Set(airportCandidates)];
  const fromAirport = uniqueAirports[0] ?? null;
  const toAirport = uniqueAirports[1] ?? null;

  // Datas: tenta DD/MM/AAAA, DD/MM/AA, AAAA-MM-DD
  const departureDate = extractDate(snippet);

  // Horários: HH:MM (24h) ou HH:MMam/pm
  const times = extractTimes(snippet);
  const departureTime = times[0] ?? null;
  const arrivalTime = times[1] ?? null;

  // Código de reserva: 6 chars alfanuméricos isolados
  // (heurística boa pra PNR, padrão da indústria)
  const reservationCode = extractReservationCode(snippet);

  return {
    flightCode,
    airline,
    fromAirport,
    toAirport,
    departureDate,
    departureTime,
    arrivalTime,
    reservationCode,
    rawSnippet: snippet.trim(),
  };
}

/** Códigos IATA conhecidos (whitelist parcial — preferimos falso negativo aqui) */
const KNOWN_AIRPORTS = new Set([
  // Brasil
  'GRU', 'CGH', 'GIG', 'SDU', 'BSB', 'CWB', 'POA', 'REC', 'FOR', 'SSA',
  'CNF', 'VCP', 'BEL', 'MAO', 'NAT', 'FLN', 'IGU', 'MCZ', 'GYN', 'VIX',
  // Europa
  'LHR', 'LGW', 'STN', 'CDG', 'ORY', 'FCO', 'BCN', 'MAD', 'AMS', 'FRA',
  'MUC', 'LIS', 'OPO', 'ZRH', 'GVA', 'VIE', 'CPH', 'ARN', 'OSL', 'HEL',
  'WAW', 'PRG', 'BUD', 'IST', 'ATH', 'DUB', 'EDI', 'BRU', 'BER', 'HAM',
  // Américas
  'JFK', 'LAX', 'MIA', 'EWR', 'ORD', 'DFW', 'ATL', 'SEA', 'BOS', 'IAD',
  'YYZ', 'YUL', 'YVR', 'EZE', 'AEP', 'SCL', 'BOG', 'LIM', 'UIO', 'PTY',
  'MEX', 'CUN', 'HAV', 'PUJ', 'SJU',
  // Ásia/Oceania/Oriente Médio
  'NRT', 'HND', 'ICN', 'PEK', 'PVG', 'HKG', 'SIN', 'BKK', 'KUL', 'CGK',
  'DXB', 'DOH', 'AUH', 'TLV', 'JNB', 'CPT', 'CAI', 'SYD', 'MEL', 'AKL',
]);

/** Falsos positivos comuns: palavras de 3 letras maiúsculas que não são aeroportos */
const NOT_AIRPORTS = new Set([
  'CPF', 'NFE', 'IBM', 'PDF', 'XML', 'CSV', 'API', 'URL', 'TLD',
  'GMT', 'UTC', 'CST', 'EST', 'PST', 'BRT', 'WET', 'CET', 'EET',
  'IDA', 'VOL', 'PNR', 'EMS', 'TAM', 'NÃO', 'NAO', 'SIM', 'COM',
]);

/**
 * Decide se uma sequência de 3 letras maiúsculas é provavelmente um código IATA.
 * Critérios (em ordem):
 * 1. Está na NOT_AIRPORTS → false
 * 2. Está na KNOWN_AIRPORTS → true
 * 3. Caso contrário → false (preferimos perder aeroportos exóticos a inventar voos errados)
 */
function isLikelyAirportCode(code: string): boolean {
  if (NOT_AIRPORTS.has(code)) return false;
  return KNOWN_AIRPORTS.has(code);
}

/**
 * Extrai a primeira data válida do snippet.
 * Formatos aceitos: DD/MM/AAAA, DD/MM/AA, AAAA-MM-DD, DD-MM-AAAA
 */
function extractDate(snippet: string): string | null {
  // ISO: 2026-05-10
  const isoMatch = snippet.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const [, y, mo, d] = isoMatch;
    if (validDate(y, mo, d)) return `${y}-${mo}-${d}`;
  }

  // BR: 10/05/2026 ou 10-05-2026
  const brMatch = snippet.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (brMatch) {
    let [, d, mo, y] = brMatch;
    if (y.length === 2) y = '20' + y;
    const dd = d.padStart(2, '0');
    const mm = mo.padStart(2, '0');
    if (validDate(y, mm, dd)) return `${y}-${mm}-${dd}`;
  }

  return null;
}

function validDate(year: string, month: string, day: string): boolean {
  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  // Sanidade: 2020-2050, mês 1-12, dia 1-31
  return y >= 2020 && y <= 2050 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

/**
 * Extrai todos os horários no snippet, em ordem.
 * Aceita: 14:30, 14h30, 2:30pm, 02:30 AM
 */
function extractTimes(snippet: string): string[] {
  const times: string[] = [];

  // 14:30 ou 14h30
  const regex24 = /\b(\d{1,2})[:h](\d{2})(?!\s*(?:am|pm))/gi;
  let m: RegExpExecArray | null;
  while ((m = regex24.exec(snippet)) !== null) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      times.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
  }

  // 2:30pm
  const regex12 = /\b(\d{1,2})[:](\d{2})\s*(am|pm)\b/gi;
  while ((m = regex12.exec(snippet)) !== null) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      times.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
  }

  return times;
}

/**
 * Tenta detectar código de reserva (PNR / locator).
 * Heurística: 6 caracteres alfanuméricos uppercase isolados,
 * próximos de palavras como "reserva", "localizador", "PNR", "código".
 */
function extractReservationCode(snippet: string): string | null {
  const lower = snippet.toLowerCase();
  const keywords = ['reserva', 'localizador', 'pnr', 'código', 'booking', 'reference', 'confirmation'];

  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;
    // Procura por 6 chars alfanuméricos no raio de 30 chars
    const window = snippet.slice(idx, idx + 80);
    const codeMatch = window.match(/\b([A-Z0-9]{6})\b/);
    if (codeMatch) return codeMatch[1];
  }

  return null;
}

/**
 * Constrói um título amigável pro itinerary_item baseado nos campos extraídos.
 * Ex: "LATAM 3024 — GRU → MAD"
 */
export function buildFlightTitle(flight: ParsedFlight): string {
  const parts: string[] = [];

  if (flight.airline) {
    parts.push(flight.airline);
  } else if (flight.flightCode) {
    parts.push(flight.flightCode.match(/^[A-Z]{2}/)?.[0] ?? 'Voo');
  }

  if (flight.flightCode) {
    const number = flight.flightCode.replace(/^[A-Z]{2}|^[A-Z]\d|^\d[A-Z]/, '');
    if (number) parts.push(number);
  }

  let title = parts.join(' ');

  if (flight.fromAirport && flight.toAirport) {
    title += ` — ${flight.fromAirport} → ${flight.toAirport}`;
  } else if (flight.fromAirport) {
    title += ` — saindo de ${flight.fromAirport}`;
  } else if (flight.toAirport) {
    title += ` — para ${flight.toAirport}`;
  }

  return title || 'Voo';
}

/**
 * Constrói notas estruturadas pro itinerary_item.
 */
export function buildFlightNotes(flight: ParsedFlight): string {
  const lines: string[] = [];

  if (flight.flightCode) lines.push(`✈️ Voo: ${flight.flightCode}`);
  if (flight.fromAirport && flight.toAirport) {
    lines.push(`📍 ${flight.fromAirport} → ${flight.toAirport}`);
  }
  if (flight.departureTime) {
    let timeLine = `🛫 Partida: ${flight.departureTime}`;
    if (flight.arrivalTime) timeLine += ` · 🛬 Chegada: ${flight.arrivalTime}`;
    lines.push(timeLine);
  }
  if (flight.reservationCode) {
    lines.push(`🎫 Localizador: ${flight.reservationCode}`);
  }

  return lines.join('\n');
}
