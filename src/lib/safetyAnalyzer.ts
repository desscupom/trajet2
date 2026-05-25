/**
 * safetyAnalyzer.ts — Analisa alertas de segurança de destinos via IA
 *
 * Usado automaticamente ao:
 * - Gerar roteiro com IA
 * - Adicionar um novo local ao roteiro
 *
 * Respeita as preferências de alerta configuradas no perfil do usuário.
 * Usa linguagem brasileira (celular, ônibus, metrô, etc).
 */

import { callOpenAI } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabase';
import { appendSafetyRules } from '@/lib/contentSafety';
import { DEFAULT_SAFETY_PREFS, type SafetyPrefs } from '@/hooks/useSafetyPrefs';

export type SafetyAlertType =
  | 'unsafe_women'
  | 'unsafe_children'
  | 'unsafe_night'
  | 'unsafe_lgbtq'
  | 'unsafe_general'
  | 'scam'
  | 'poor_accessibility'
  | 'overcrowded'
  | 'closed_permanently'
  | 'different_from_photos';

export type AIGeneratedAlert = {
  alert_type: SafetyAlertType;
  severity: 1 | 2 | 3;
  description: string;
};

export type PlaceSafetyInfo = {
  place_name: string;
  place_id: string;
  alerts: AIGeneratedAlert[];
  general_safety_score: 1 | 2 | 3 | 4 | 5;
  summary: string;
};

const SAFETY_SYSTEM_PROMPT = appendSafetyRules(`Você é um especialista em segurança para viajantes brasileiros.
Analise a segurança dos locais e retorne um JSON com alertas específicos e objetivos.

REGRAS DE LINGUAGEM — use sempre termos brasileiros:
- "celular" (não "telemóvel" ou "telefone")
- "ônibus" (não "autocarro")
- "metrô" (não "metropolitano" ou "metro")
- "bairro" (não "quarteirão")
- "apartamento" (não "apartamento/flat")
- "carro" (não "automóvel")
- "bolsa" (não "mala de mão")
- Use reais (R$) como referência de valores quando necessário
- Escreva de forma direta e clara para brasileiros

Seja factual, sem alarmismo. Só inclua alertas com base real.
Responda APENAS com JSON válido. Não use markdown (sem ** ou *). Seja direto e conciso.`, true);

/**
 * Busca as preferências de segurança do usuário no banco.
 */
export async function getUserSafetyPrefs(userId: string): Promise<SafetyPrefs> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('safety_alert_prefs')
      .eq('id', userId)
      .single();
    if (data?.safety_alert_prefs) {
      return { ...DEFAULT_SAFETY_PREFS, ...data.safety_alert_prefs };
    }
  } catch {}
  return DEFAULT_SAFETY_PREFS;
}

/**
 * Filtra alertas gerados pela IA conforme preferências do usuário.
 */
function filterAlertsByPrefs(
  alerts: AIGeneratedAlert[],
  prefs: SafetyPrefs,
): AIGeneratedAlert[] {
  return alerts.filter((alert) => prefs[alert.alert_type] === true);
}

/**
 * Analisa a segurança de um único local via IA.
 */
export async function analyzeLocalSafety(
  placeName: string,
  placeId: string,
  destination: string,
  userId?: string,
  preloadedPrefs?: SafetyPrefs,
): Promise<PlaceSafetyInfo | null> {
  try {
    const prefs = preloadedPrefs ?? (userId ? await getUserSafetyPrefs(userId) : DEFAULT_SAFETY_PREFS);
    const enabledTypes = Object.entries(prefs)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // Se nenhum tipo ativado, não analisa
    if (enabledTypes.length === 0) return null;

    const enabledStr = enabledTypes.join(', ');
    const now = new Date();
    const monthYear = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const prompt = `Analise a segurança do local abaixo para viajantes brasileiros em ${monthYear}.

Local: "${placeName}"
Cidade/Destino: ${destination}

Considere APENAS estes tipos de alerta relevantes para este usuário: ${enabledStr}

Retorne um JSON com este formato exato:
{
  "general_safety_score": <número 1-5, sendo 5 muito seguro>,
  "summary": "<resumo de 1 frase em português brasileiro sobre a segurança geral>",
  "alerts": [
    {
      "alert_type": "<tipo>",
      "severity": <1=aviso leve, 2=cuidado, 3=evitar>,
      "description": "<1 frase objetiva sem asteriscos, em português brasileiro>"
    }
  ]
}

Tipos válidos: unsafe_women, unsafe_children, unsafe_night, unsafe_lgbtq, unsafe_general, scam, poor_accessibility, overcrowded, closed_permanently, different_from_photos

IMPORTANTE: Só inclua alertas se houver risco real documentado. Se o local for seguro, retorne alerts vazio. Máximo 3 alertas reais.
Use linguagem simples e direta para brasileiros (celular, ônibus, metrô, etc).`;

    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SAFETY_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 400,
    });


    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('[safetyAnalyzer] erro ao parsear JSON:', raw.slice(0, 100));
      return null;
    }

    const allAlerts: AIGeneratedAlert[] = (parsed.alerts ?? [])
      .filter((a: any) => a.alert_type && a.severity && a.description)
      .slice(0, 3);


    // Filtra conforme preferências do usuário
    const filteredAlerts = filterAlertsByPrefs(allAlerts, prefs);

    const result: PlaceSafetyInfo = {
      place_name: placeName,
      place_id: placeId,
      general_safety_score: Math.min(5, Math.max(1, parseInt(parsed.general_safety_score) || 4)) as 1|2|3|4|5,
      summary: parsed.summary ?? '',
      alerts: filteredAlerts,
    };

    // Salva no banco apenas os alertas que passaram pelo filtro
    if (userId && result.alerts.length > 0) {
      await saveAIAlerts(result, userId);
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Analisa vários locais de uma vez (batch para geração de roteiro).
 */
export async function analyzeMultiplePlaces(
  places: { name: string; id: string }[],
  destination: string,
  userId?: string,
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, PlaceSafetyInfo>> {
  const results = new Map<string, PlaceSafetyInfo>();
  if (places.length === 0) return results;

  const prefs = userId ? await getUserSafetyPrefs(userId) : DEFAULT_SAFETY_PREFS;
  const enabledTypes = Object.entries(prefs)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');

  // Se usuário desativou todos os alertas, não analisa
  if (!enabledTypes) return results;

  try {
    const now = new Date();
    const monthYear = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const placeList = places.map((p, i) => `${i + 1}. "${p.name}"`).join('\n');

    const prompt = `Analise a segurança dos seguintes locais para viajantes brasileiros em ${monthYear}.
Destino: ${destination}

Locais:
${placeList}

Considere APENAS estes tipos de alerta: ${enabledTypes}

Retorne um JSON:
{
  "places": [
    {
      "name": "<nome do local>",
      "general_safety_score": <1-5>,
      "summary": "<1 frase em português brasileiro>",
      "alerts": [
        {
          "alert_type": "<tipo>",
          "severity": <1-3>,
          "description": "<1 frase objetiva sem asteriscos, em português brasileiro>"
        }
      ]
    }
  ]
}

IMPORTANTE: Só inclua alertas com risco real. Se seguro, alerts: []. Máximo 2 por local.
Use linguagem brasileira: celular, ônibus, metrô, bairro, etc.`;

    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SAFETY_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1000,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return results;
    }

    const parsedPlaces = parsed.places ?? [];
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const data = parsedPlaces.find((p: any) =>
        p.name?.toLowerCase().includes(place.name.toLowerCase().slice(0, 10))
      ) ?? parsedPlaces[i];

      if (!data) continue;

      const allAlerts: AIGeneratedAlert[] = (data.alerts ?? [])
        .filter((a: any) => a.alert_type && a.severity && a.description)
        .slice(0, 2);

      // Filtra conforme preferências
      const filteredAlerts = filterAlertsByPrefs(allAlerts, prefs);

      const info: PlaceSafetyInfo = {
        place_name: place.name,
        place_id: place.id,
        general_safety_score: Math.min(5, Math.max(1, parseInt(data.general_safety_score) || 4)) as 1|2|3|4|5,
        summary: data.summary ?? '',
        alerts: filteredAlerts,
      };

      results.set(place.id, info);
      onProgress?.(i + 1, places.length);

      if (userId && info.alerts.length > 0) {
        await saveAIAlerts(info, userId).catch(() => {});
      }
    }
  } catch {}

  return results;
}

/**
 * Salva alertas da IA no banco sem duplicar.
 */
async function saveAIAlerts(info: PlaceSafetyInfo, userId: string): Promise<void> {
  try {
    // Verifica se já tem alertas AI para este place_id (evita duplicatas)
    const { data: existing, error: selectErr } = await (supabase as any)
      .from('place_safety_alerts')
      .select('id')
      .eq('place_id', info.place_id)
      .eq('source', 'ai')
      .limit(1);

    if (selectErr) {
      console.warn('[safetyAnalyzer] erro ao verificar duplicatas:', selectErr.message);
    }

    if (existing && existing.length > 0) {
      return;
    }

    const inserts = info.alerts.map((alert) => ({
      place_id: info.place_id,
      place_name: info.place_name,
      alert_type: alert.alert_type,
      severity: alert.severity,
      description: alert.description,
      reported_by: userId,
      confirmed_count: 0,
      source: 'ai',
    }));

    if (inserts.length === 0) return;

    const { error: insertErr } = await (supabase as any)
      .from('place_safety_alerts')
      .insert(inserts);

    if (insertErr) {
      console.warn('[safetyAnalyzer] erro ao salvar alertas:', insertErr.message, insertErr.details);
    } else {
    }
  } catch (err: any) {
    console.warn('[safetyAnalyzer] erro inesperado no saveAIAlerts:', err?.message);
  }
}

/**
 * Verifica se um local tem alertas relevantes para o usuário.
 */
export async function checkPlaceHasAlerts(
  placeId: string,
  userId?: string,
  placeName?: string,
): Promise<boolean> {
  try {
    // Busca por place_id. Se não achar, tenta por place_name (fallback)
    const { data } = await (supabase as any)
      .from('place_safety_alerts')
      .select('alert_type')
      .or(placeName
        ? `place_id.eq.${placeId},place_name.ilike.%${placeName.slice(0, 20)}%`
        : `place_id.eq.${placeId}`)
      .gte('severity', 2);

    if (!data || data.length === 0) return false;
    if (!userId) return true;

    const prefs = await getUserSafetyPrefs(userId);
    return data.some((a: any) => prefs[a.alert_type as SafetyAlertType] === true);
  } catch {
    return false;
  }
}

