/**
 * Cover photo da viagem.
 *
 * Busca fotos REAIS de cada cidade/destino no Pexels, com cache compartilhado
 * no Supabase (tabela cover_photo_cache).
 *
 * Fluxo:
 * 1. Extrai keyword do título da viagem (ex: "Lisboa em outubro" → "Lisboa")
 * 2. Busca no cache do Supabase. Se hit, retorna.
 * 3. Senão, chama Pexels API e popula o cache.
 * 4. Fallback final: foto genérica de viagem (também do Pexels, com keyword "travel").
 *
 * Determinismo: mesmo título → mesma foto sempre (cache compartilhado).
 * Performance: na maioria dos casos é só 1 read no Supabase (sem hit no Pexels).
 */

import { supabase } from '@/lib/supabase';

const PEXELS_API_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
const PEXELS_API_URL = 'https://api.pexels.com/v1/search';

/** Quantas fotos sugerimos quando o user abre o wizard. */
const SUGGESTIONS_COUNT = 6;

/**
 * Cache em memória pra evitar refetch dentro da mesma sessão.
 * keyword → photo_urls.
 */
const memoryCache = new Map<string, string[]>();

/**
 * Limpa o título e extrai uma keyword utilizável pra buscar no Pexels.
 *
 * Heurísticas:
 * - Remove preposições e conectores ("em outubro", "no Caribe", "em 2026")
 * - Remove anos (2024-2030)
 * - Remove palavras de duração ("dias", "semanas")
 * - Mantém o "primeiro pedaço significativo" (geralmente é o destino)
 *
 * Exemplos:
 *   "Lisboa em outubro" → "Lisboa"
 *   "Tokyo 2026" → "Tokyo"
 *   "Roteiro pela Itália" → "Itália"
 *   "Réveillon na praia" → "praia"
 *   "Maldivas com a família" → "Maldivas"
 */
export function extractKeyword(title: string): string {
  if (!title) return 'travel';

  const normalized = title.trim();

  // Remove anos
  let cleaned = normalized.replace(/\b(20\d{2}|19\d{2})\b/g, ' ');

  // Remove preposições e palavras de tempo no final/meio
  const STOP_WORDS_PT = [
    'em', 'no', 'na', 'nos', 'nas',
    'de', 'da', 'do', 'das', 'dos',
    'com', 'a', 'o', 'as', 'os',
    'pela', 'pelo', 'pela', 'pelos', 'pelas',
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    'dias', 'dia', 'semana', 'semanas', 'mês', 'mes', 'meses',
    'ano', 'anos', 'tempo',
    'roteiro', 'viagem', 'minha', 'meu', 'nossa', 'nosso',
    'família', 'familia', 'amigos', 'amigas', 'turma',
    'férias', 'ferias', 'feriado',
  ];
  const STOP_WORDS_EN = [
    'in', 'on', 'at', 'to', 'with', 'and', 'or', 'the', 'a', 'an',
    'of', 'for', 'from', 'my', 'our', 'their',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'days', 'day', 'week', 'weeks', 'month', 'months',
    'trip', 'travel', 'vacation', 'holiday',
  ];
  const STOP_WORDS = new Set([...STOP_WORDS_PT, ...STOP_WORDS_EN]);

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  // Filtra stop words mas mantém palavras que começam com maiúscula
  // (provavelmente nomes próprios — destinos)
  const meaningful = words.filter((w) => {
    const lower = w.toLowerCase();
    if (STOP_WORDS.has(lower)) return false;
    if (lower.length < 2) return false;
    return true;
  });

  // Se sobrou nada, usa o título inteiro
  if (meaningful.length === 0) return normalized;

  // Junta as primeiras 3 palavras (tipicamente "Cidade País" ou "destino")
  return meaningful.slice(0, 3).join(' ');
}

/**
 * Busca fotos no Pexels API.
 * Retorna URLs em ordem de relevância. Pega `large` (1280px) — bom pra cover.
 *
 * IMPORTANTE: adiciona contexto "city" / "landscape" ao termo pra evitar:
 * - Marcas comerciais (ex: "Europa" sozinho retorna aviões da Air Europa)
 * - Pessoas com aquele nome (ex: "Maria")
 * - Resultados aleatórios
 *
 * O termo "city skyline" funciona melhor pra cidades. "landscape" pra países.
 */
async function fetchFromPexels(
  keyword: string,
  count: number = SUGGESTIONS_COUNT,
): Promise<string[]> {
  if (!PEXELS_API_KEY) {
    console.warn('[coverPhoto] PEXELS_API_KEY ausente — usando fallback');
    return [];
  }

  // Contexto pra desambiguar: força busca por destino turístico, não marca/empresa
  const enhancedQuery = `${keyword} city skyline`;

  try {
    const url = `${PEXELS_API_URL}?query=${encodeURIComponent(enhancedQuery)}&per_page=${count}&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!response.ok) {
      console.warn(`[coverPhoto] Pexels respondeu ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      photos: Array<{
        src: { large2x?: string; large?: string; landscape?: string };
      }>;
    };

    let photos = (data.photos ?? [])
      .map((p) => p.src.large2x || p.src.landscape || p.src.large || '')
      .filter(Boolean);

    // Fallback: se "X city skyline" não retornou nada, tenta com "travel"
    if (photos.length === 0) {
      const fallbackQuery = `${keyword} travel`;
      const fbUrl = `${PEXELS_API_URL}?query=${encodeURIComponent(fallbackQuery)}&per_page=${count}&orientation=landscape`;
      const fbRes = await fetch(fbUrl, {
        headers: { Authorization: PEXELS_API_KEY },
      });
      if (fbRes.ok) {
        const fbData = (await fbRes.json()) as typeof data;
        photos = (fbData.photos ?? [])
          .map((p) => p.src.large2x || p.src.landscape || p.src.large || '')
          .filter(Boolean);
      }
    }

    return photos;
  } catch (err) {
    console.warn('[coverPhoto] Erro ao buscar Pexels:', err);
    return [];
  }
}

/**
 * Lê cache do Supabase. Retorna [] se não houver entrada.
 * Faz best-effort: se a query falhar, retorna [] (não bloqueia o fluxo).
 */
async function readCache(keyword: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('cover_photo_cache')
      .select('photo_urls')
      .eq('keyword', keyword)
      .maybeSingle();

    if (error || !data) return [];

    const urls = data.photo_urls;
    if (Array.isArray(urls)) return urls.filter((u): u is string => typeof u === 'string');
    return [];
  } catch {
    return [];
  }
}

/**
 * Salva no cache do Supabase. Best-effort — falha silenciosa.
 */
async function writeCache(keyword: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await supabase.from('cover_photo_cache').upsert({
      keyword,
      photo_urls: urls,
      source: 'pexels',
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // ignora — cache é otimização, não essencial
  }
}

/**
 * Busca uma lista de fotos pra uma keyword. Faz cascata:
 * 1. Cache em memória (sessão)
 * 2. Cache no Supabase
 * 3. Pexels API (e popula caches)
 *
 * Sempre retorna array (vazio se tudo falhou).
 */
export async function getPhotosForKeyword(keyword: string): Promise<string[]> {
  // Normaliza pra ASCII lowercase pra ficar compatível com a RLS policy
  // do cache (que só aceita [a-z0-9 \-]) e evitar duplicatas (são paulo / sao paulo).
  const normalized = keyword
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9 \-]+/g, '') // remove qualquer caractere que não passe na RLS
    .replace(/\s+/g, ' ') // colapsa espaços múltiplos
    .trim();
  if (!normalized) return [];

  // 1. Memória
  if (memoryCache.has(normalized)) {
    return memoryCache.get(normalized)!;
  }

  // 2. Supabase
  const cached = await readCache(normalized);
  if (cached.length > 0) {
    memoryCache.set(normalized, cached);
    return cached;
  }

  // 3. Pexels
  const fresh = await fetchFromPexels(normalized);
  if (fresh.length > 0) {
    memoryCache.set(normalized, fresh);
    // Não esperar — gravação é fire-and-forget
    writeCache(normalized, fresh);
    return fresh;
  }

  return [];
}

/**
 * Pega URL principal pra usar como cover. Usa primeira foto da keyword,
 * com fallback pra "travel" se nada for encontrado.
 *
 * @param customUrl URL salva pelo user (upload custom). Tem prioridade absoluta.
 */
export async function fetchTripCoverUrl(
  title: string,
  customUrl?: string | null,
): Promise<string | null> {
  if (customUrl) return customUrl;

  const keyword = extractKeyword(title);
  const photos = await getPhotosForKeyword(keyword);
  if (photos.length > 0) return photos[0];

  // Fallback: termo genérico
  if (keyword.toLowerCase() !== 'travel') {
    const fallback = await getPhotosForKeyword('travel destination');
    if (fallback.length > 0) return fallback[0];
  }

  return null;
}

/**
 * Sugestões pra mostrar no wizard: as N fotos top da keyword extraída.
 */
export async function fetchCoverSuggestions(title: string): Promise<string[]> {
  const keyword = extractKeyword(title);
  const photos = await getPhotosForKeyword(keyword);
  if (photos.length >= SUGGESTIONS_COUNT) {
    return photos.slice(0, SUGGESTIONS_COUNT);
  }

  // Se faltam, complementa com keyword genérica
  const generic = await getPhotosForKeyword('travel destination');
  return [...photos, ...generic].slice(0, SUGGESTIONS_COUNT);
}

/**
 * Sync version pra retro-compatibilidade.
 *
 * IMPORTANTE: essa NÃO faz fetch — retorna apenas URL salva (custom)
 * ou null. Pra ter foto automática, usar o hook `useCoverPhoto`.
 *
 * Mantida pra não quebrar callers existentes que esperavam função síncrona.
 */
export function getTripCoverUrl(
  _title: string,
  customUrl?: string | null,
): string | null {
  return customUrl ?? null;
}

/**
 * @deprecated Use `fetchCoverSuggestions` (async).
 * Mantido pra retro-compatibilidade — retorna [] (UI deve fazer fetch).
 */
export function getCoverSuggestions(_title: string): string[] {
  return [];
}
