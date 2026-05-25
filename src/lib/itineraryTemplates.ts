import { supabase } from '@/lib/supabase';
import type {
  SuggestedDay,
  SuggestionInput,
  SuggestionPace,
  SuggestionStyle,
} from '@/lib/itinerarySuggester';

/**
 * Templates de roteiros gerados por IA.
 *
 * Estrutura dupla:
 * - **Cache** (reaproveitamento): quando o user gera roteiro com mesmos
 *   parâmetros, retorna template salvo em vez de chamar OpenAI.
 *   Economia: ~$0.005 por chamada evitada.
 *
 * - **Galeria** (compartilhamento): user pode marcar template como público.
 *   Outros users vêem na galeria ao criar nova viagem.
 */

export type ItineraryTemplate = {
  id: string;
  created_by: string | null;
  cache_key: string;
  destination: string;
  days_count: number;
  style: string | null;
  pace: string | null;
  notes: string | null;
  data: { days: SuggestedDay[] };
  is_public: boolean;
  reuse_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * Gera uma chave de cache normalizada a partir dos parâmetros.
 *
 * Mesma chave = mesmo template. Não inclui hash de `notes` pra evitar
 * fragmentação — duas viagens "Lisboa 5 dias gastronômico" reaproveitam
 * o mesmo cache mesmo com notes ligeiramente diferentes.
 *
 * Se quiser maior precisão futuro, pode adicionar hash de notes.
 */
export function buildCacheKey(input: SuggestionInput): string {
  return [
    normalizeDest(input.destination),
    input.days,
    input.style ?? '',
    input.pace ?? '',
  ].join('|');
}

function normalizeDest(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '') // só alfanumérico
    .slice(0, 50); // limite
}

/**
 * Busca o melhor template pra esses parâmetros.
 *
 * Prioridade:
 * 1. Próprio (own) público
 * 2. Próprio privado
 * 3. Outro user público
 *
 * Retorna null se não tem match.
 */
export async function findMatchingTemplate(
  input: SuggestionInput,
): Promise<ItineraryTemplate | null> {
  const cacheKey = buildCacheKey(input);

  const { data, error } = await supabase
    .from('itinerary_templates')
    .select('*')
    .eq('cache_key', cacheKey)
    .order('reuse_count', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return null;

  // O .order já vem por popularidade. Retorna o primeiro.
  return data[0] as ItineraryTemplate;
}

/**
 * Salva um template novo a partir de um roteiro gerado.
 * Chama isso após a IA retornar e o user confirmar (não na hora de gerar).
 */
export async function saveTemplate(
  input: SuggestionInput,
  days: SuggestedDay[],
  options?: { isPublic?: boolean },
): Promise<ItineraryTemplate | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const cacheKey = buildCacheKey(input);

  const { data, error } = await supabase
    .from('itinerary_templates')
    .insert({
      created_by: userData.user.id,
      cache_key: cacheKey,
      destination: input.destination,
      days_count: input.days,
      style: input.style ?? null,
      pace: input.pace ?? null,
      notes: input.notes ?? null,
      data: { days },
      is_public: options?.isPublic ?? false,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('Erro salvando template:', error);
    return null;
  }
  return data as ItineraryTemplate;
}

/**
 * Incrementa o contador de reaproveitamento de um template.
 * Chamado quando o user usa o template em vez de chamar a IA.
 */
export async function bumpTemplateReuse(templateId: string): Promise<void> {
  await supabase.rpc('bump_template_reuse', { _template_id: templateId });
}

/**
 * Lista templates do user logado (próprios).
 */
export async function listMyTemplates(): Promise<ItineraryTemplate[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];

  const { data, error } = await supabase
    .from('itinerary_templates')
    .select('*')
    .eq('created_by', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as ItineraryTemplate[];
}

/**
 * Lista templates públicos pra galeria.
 * Filtros opcionais: destino, dias.
 */
export async function listPublicTemplates(filter?: {
  destination?: string;
  daysCount?: number;
}): Promise<ItineraryTemplate[]> {
  let query = supabase
    .from('itinerary_templates')
    .select('*')
    .eq('is_public', true)
    .order('reuse_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (filter?.destination) {
    query = query.ilike('destination', `%${filter.destination}%`);
  }
  if (filter?.daysCount) {
    query = query.eq('days_count', filter.daysCount);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as ItineraryTemplate[];
}

/**
 * Toggle is_public em um template (compartilhar/descompartilhar).
 */
export async function setTemplatePublic(
  templateId: string,
  isPublic: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('itinerary_templates')
    .update({ is_public: isPublic })
    .eq('id', templateId);
  if (error) throw new Error(error.message);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('itinerary_templates')
    .delete()
    .eq('id', templateId);
  if (error) throw new Error(error.message);
}

/**
 * Labels legíveis pra style/pace (mapeamento pra UI).
 */
export const STYLE_LABELS_PT: Record<SuggestionStyle, string> = {
  tourist: 'Turístico',
  gastronomic: 'Gastronômico',
  romantic: 'Romântico',
  family: 'Família',
  adventure: 'Aventura',
  cultural: 'Cultural',
};

export const PACE_LABELS_PT: Record<SuggestionPace, string> = {
  relaxed: 'Relaxado',
  balanced: 'Balanceado',
  intense: 'Intenso',
};

/**
 * Compartilha um roteiro gerado na galeria pública.
 * Atualiza o template existente para is_public = true,
 * ou cria um novo se não existir.
 */
export async function shareTemplateToGallery(
  destination: string,
  days: any[],
  userId: string,
  opts?: { pace?: string; styles?: string[] },
): Promise<void> {
  const cacheKey = `${destination.toLowerCase().trim()}-${days.length}d`;

  // Verifica se já existe template deste usuário para este destino
  const { data: existing } = await supabase
    .from('itinerary_templates')
    .select('id')
    .eq('created_by', userId)
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('itinerary_templates')
      .update({ is_public: true })
      .eq('id', existing.id);
  } else {
    // Salva como público diretamente
    const data = days.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title,
      items: (day.items ?? []).map((it: any) => ({
        name: it.name,
        category: it.category,
        startTime: it.startTime,
        durationMinutes: it.durationMinutes,
      })),
    }));

    await supabase.from('itinerary_templates').insert({
      cache_key: cacheKey,
      destination: destination.trim(),
      days_count: days.length,
      data,
      is_public: true,
      created_by: userId,
      pace: opts?.pace ?? null,
      style: opts?.styles?.join(',') ?? null,
    });
  }
}
