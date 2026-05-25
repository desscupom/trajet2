import { appendSafetyRules } from '@/lib/contentSafety';
import { callOpenAI } from '@/lib/openaiClient';

/**
 * Sugere opções de hospedagem com IA baseado em destino, orçamento e preferências.
 *
 * IMPORTANTE: a IA NÃO retorna preços/disponibilidade reais — ela retorna
 * recomendações conhecidas (hotéis famosos, bairros bons pra ficar, etc).
 * O user precisa confirmar disponibilidade no Booking/Airbnb/etc antes de reservar.
 *
 * Custo: ~$0.001 por consulta.
 */

const SYSTEM_PROMPT = `Você é um especialista em hospedagem para viagens.
Dado um destino, número de noites, faixa de orçamento e preferências, sugira opções de hospedagem REAIS e conhecidas.

REGRAS CRÍTICAS:
- Responda APENAS com JSON válido, sem markdown.
- Sugira hospedagens REAIS (nome real do hotel/airbnb/region).
- Inclua BAIRRO/REGIÃO conhecida em vez de hotéis específicos quando "kind" for "airbnb".
- NÃO invente preços específicos — use a faixa que o user informou.
- Inclua dica curta sobre o lugar/bairro em "notes".
- Categorize "kind" como: "hotel", "airbnb", "hostel", "house", "other".

SCHEMA DE SAÍDA:
{
  "lodgings": [
    {
      "name": "Hotel Riu Plaza España",
      "kind": "hotel",
      "neighborhood": "Gran Vía, Madri",
      "estimatedPriceLevel": "moderate",
      "notes": "Hotel grande com piscina no topo, ótima localização perto do metrô"
    }
  ]
}

VALORES VÁLIDOS:
- estimatedPriceLevel: "budget" (econômico), "moderate" (médio), "premium" (caro), "luxury" (luxo)

DICAS:
- Para "luxury": grandes redes (Four Seasons, Mandarin, Park Hyatt), boutique premium
- Para "moderate": redes médias bem avaliadas (Ibis, NH, Holiday Inn), Airbnb em bom bairro
- Para "budget": hostels, B&Bs, Airbnb em bairros mais afastados mas seguros
- Misture tipos pra dar opções (se user pediu 5: 2 hotéis + 2 airbnbs + 1 hostel, por exemplo)
- Priorize SEGURANÇA + LOCALIZAÇÃO sobre preço`;

export type LodgingPriceLevel = 'budget' | 'moderate' | 'premium' | 'luxury';

export type SuggestedLodging = {
  name: string;
  kind: 'hotel' | 'airbnb' | 'hostel' | 'house' | 'other';
  neighborhood: string | null;
  estimatedPriceLevel: LodgingPriceLevel;
  notes: string | null;
};

export type LodgingSuggestionInput = {
  destination: string;
  /** Quantas opções sugerir (default 4) */
  count: number;
  priceLevel?: LodgingPriceLevel;
  /** Tipo preferido — se omitido, IA mistura tipos */
  kindPreference?: 'hotel' | 'airbnb' | 'hostel' | 'mixed';
  /** Anotações livres (ex: "perto do centro", "boa pra família com criança") */
  notes?: string;
};

export type LodgingSuggestionResult = {
  lodgings: SuggestedLodging[];
  usedAI: boolean;
  error?: string;
};

export async function suggestLodgings(
  input: LodgingSuggestionInput,
): Promise<LodgingSuggestionResult> {
  try {
    const prompt = buildPrompt(input);
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: appendSafetyRules(SYSTEM_PROMPT, true) },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    });

    return { lodgings: parseResponse(raw), usedAI: true };
  } catch (err: any) {
    console.warn('[suggestLodgings] erro:', err);
    let message = err?.message ?? String(err);
    if (err?.name === 'AbortError' || message.includes('Aborted')) {
      message = 'A IA demorou demais. Tente de novo.';
    } else if (message.includes('OPENAI_API_KEY')) {
      message = 'Chave OpenAI não configurada.';
    } else if (message.includes('429')) {
      message = 'Muitas requisições. Aguarde uns segundos.';
    }
    return {
      lodgings: [],
      usedAI: false,
      error: message,
    };
  }
}

function buildPrompt(input: LodgingSuggestionInput): string {
  const parts: string[] = [
    `Destino: ${input.destination}`,
    `Sugira ${input.count} opções de hospedagem.`,
  ];

  if (input.priceLevel) {
    const labels: Record<LodgingPriceLevel, string> = {
      budget: 'econômico (custo-benefício)',
      moderate: 'médio (custo-benefício balanceado)',
      premium: 'premium (conforto, bem localizado)',
      luxury: 'luxo (alto padrão, experiência diferenciada)',
    };
    parts.push(`\nOrçamento: ${labels[input.priceLevel]}`);
  }

  if (input.kindPreference && input.kindPreference !== 'mixed') {
    parts.push(`\nTipo preferido: ${input.kindPreference}`);
  } else if (input.kindPreference === 'mixed') {
    parts.push('\nMisture tipos: hotéis, airbnbs e hostels.');
  }

  if (input.notes?.trim()) {
    parts.push(`\nObservações: ${input.notes.trim()}`);
  }

  return parts.join('\n');
}

function parseResponse(raw: string): SuggestedLodging[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const lodgings = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];

  return lodgings
    .map((l: any): SuggestedLodging | null => {
      const name = sanitizeString(l?.name);
      if (!name) return null;

      return {
        name,
        kind: sanitizeKind(l?.kind),
        neighborhood: sanitizeString(l?.neighborhood),
        estimatedPriceLevel: sanitizePriceLevel(l?.estimatedPriceLevel),
        notes: sanitizeString(l?.notes),
      };
    })
    .filter((l: SuggestedLodging | null): l is SuggestedLodging => l !== null);
}

function sanitizeString(v: any): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== 'null' ? t : null;
}

function sanitizeKind(v: any): SuggestedLodging['kind'] {
  const valid = ['hotel', 'airbnb', 'hostel', 'house', 'other'];
  return valid.includes(v) ? v : 'hotel';
}

function sanitizePriceLevel(v: any): LodgingPriceLevel {
  const valid = ['budget', 'moderate', 'premium', 'luxury'];
  return valid.includes(v) ? v : 'moderate';
}
