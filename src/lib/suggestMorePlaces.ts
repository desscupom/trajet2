import { appendSafetyRules } from '@/lib/contentSafety';
import { callOpenAI } from '@/lib/openaiClient';
import { type SuggestedItem, type SuggestionStyle } from '@/lib/itinerarySuggester';

/**
 * Sugere lugares adicionais pra um dia que já tem alguns lugares.
 */

const SYSTEM_PROMPT = `Você é um especialista em planejamento de viagens.
Dado um destino, lugares já planejados num dia, e quantos lugares novos sugerir, gere sugestões complementares.

REGRAS:
- Responda APENAS com JSON válido, sem markdown.
- Lugares devem ser REAIS e bem conhecidos.
- Use o nome OFICIAL pra facilitar busca no mapa.
- NÃO repita lugares já planejados.
- Sugira lugares que COMPLEMENTEM os existentes (perto, no fluxo do dia).
- Categorize: "sight", "food", "shopping", "nature", "museum", "nightlife", "other".
- Use HH:MM 24h pra start_time.

SCHEMA DE SAÍDA:
{
  "items": [
    {
      "name": "Pastéis de Belém",
      "description": "Lendária pastelaria fundada em 1837",
      "category": "food",
      "startTime": "10:30",
      "durationMinutes": 45
    }
  ]
}`;

export type SuggestMoreInput = {
  destination: string;
  existingPlaces: Array<{
    name: string;
    startTime?: string | null;
    category?: string | null;
  }>;
  count: number;
  style?: SuggestionStyle;
  notes?: string;
};

export type SuggestMoreResult = {
  items: SuggestedItem[];
  usedAI: boolean;
  error?: string;
};

export async function suggestMorePlaces(
  input: SuggestMoreInput,
): Promise<SuggestMoreResult> {
  try {
    const prompt = buildPrompt(input);
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: appendSafetyRules(SYSTEM_PROMPT, true) },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    return { items: parseResponse(raw), usedAI: true };
  } catch (err: any) {
    console.warn('[suggestMore] erro:', err);
    let message = err?.message ?? String(err);
    if (err?.name === 'AbortError' || message.includes('Aborted')) {
      message = 'A IA demorou demais. Tente de novo.';
    } else if (message.includes('OPENAI_API_KEY')) {
      message = 'Chave OpenAI não configurada.';
    } else if (message.includes('429')) {
      message = 'Muitas requisições. Aguarde uns segundos.';
    }
    return {
      items: [],
      usedAI: false,
      error: message,
    };
  }
}

function buildPrompt(input: SuggestMoreInput): string {
  const parts: string[] = [
    `Destino: ${input.destination}`,
    `Sugira ${input.count} lugares novos pra este dia.`,
  ];

  if (input.existingPlaces.length > 0) {
    parts.push('\nLugares já planejados (NÃO repetir):');
    input.existingPlaces.forEach((p) => {
      const time = p.startTime ? `${p.startTime} - ` : '';
      const cat = p.category ? ` [${p.category}]` : '';
      parts.push(`- ${time}${p.name}${cat}`);
    });
  } else {
    parts.push('\nDia vazio — fique livre pra escolher os melhores.');
  }

  if (input.style) {
    const labels: Record<SuggestionStyle, string> = {
      tourist: 'turístico',
      gastronomic: 'gastronômico',
      romantic: 'romântico',
      family: 'família com crianças',
      adventure: 'aventura/natureza',
      cultural: 'cultural',
    };
    parts.push(`\nEstilo: ${labels[input.style]}`);
  }

  if (input.notes?.trim()) {
    parts.push(`\nObservação: ${input.notes.trim()}`);
  }

  return parts.join('\n');
}

function parseResponse(raw: string): SuggestedItem[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  return items
    .map((it: any): SuggestedItem | null => {
      const name = sanitizeString(it?.name);
      if (!name) return null;
      return {
        name,
        description: sanitizeString(it?.description),
        category: sanitizeString(it?.category) ?? 'other',
        startTime: sanitizeTime(it?.startTime),
        durationMinutes: sanitizeNumber(it?.durationMinutes),
      };
    })
    .filter((i: SuggestedItem | null): i is SuggestedItem => i !== null);
}

function sanitizeString(v: any): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== 'null' ? t : null;
}

function sanitizeTime(v: any): string | null {
  const s = sanitizeString(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function sanitizeNumber(v: any): number | null {
  if (typeof v === 'number' && v > 0 && v < 1440) return v;
  return null;
}
