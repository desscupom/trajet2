import { appendSafetyRules } from '@/lib/contentSafety';
import { callOpenAI } from '@/lib/openaiClient';

/**
 * Gerador de roteiro com IA.
 * Usa o cliente unificado `openaiClient.ts`.
 */

const SYSTEM_PROMPT = `Você é um especialista em planejamento de viagens.
Dado um destino, número de dias e preferências do viajante, gera um roteiro com lugares pra visitar em cada dia.

REGRAS:
- Responda APENAS com JSON válido, sem markdown nem comentários.
- Lugares devem ser REAIS e bem conhecidos (não invente).
- Use o nome OFICIAL do lugar pra facilitar a busca no mapa (ex: "Museu do Louvre" e não só "Louvre").
- Categorize cada lugar como: "sight", "food", "shopping", "nature", "museum", "nightlife", "other".
- Cada dia deve ter 3 a 5 lugares.
- Distribua horários de forma realista.
- Use HH:MM formato 24h.
- Cada dia deve ter um TÍTULO/TEMA curto.

SCHEMA DE SAÍDA:
{
  "days": [
    {
      "dayNumber": 1,
      "title": "Centro Histórico",
      "summary": "Explorando o coração da cidade",
      "items": [
        {
          "name": "Praça do Comércio, Lisboa",
          "description": "Praça monumental à beira do rio Tejo",
          "category": "sight",
          "startTime": "09:00",
          "durationMinutes": 60
        }
      ]
    }
  ]
}

DICAS:
- Começar 9-10h, almoço 12-13h, jantar 19-20h.
- Agrupar lugares próximos no mesmo dia.
- Pelo menos 1 opção de comida por dia.
- "relaxed": no máximo 3 lugares/dia. "intense": 4-5.
- "romantic": jantares, vistas, charmoso. "family": evite nightlife. "adventure": natureza.
- "cultural": museus, história. "gastronomic": restaurantes, mercados.`;

export type SuggestionStyle =
  | 'tourist'
  | 'gastronomic'
  | 'romantic'
  | 'family'
  | 'adventure'
  | 'cultural';

export type SuggestionPace = 'relaxed' | 'balanced' | 'intense';

export type SuggestedItem = {
  name: string;
  description: string | null;
  category: string;
  startTime: string | null;
  durationMinutes: number | null;
};

export type SuggestedDay = {
  dayNumber: number;
  title: string;
  summary: string | null;
  items: SuggestedItem[];
};

export type SuggestionInput = {
  destination: string;
  days: number;
  style?: SuggestionStyle;
  styles?: SuggestionStyle[]; // múltiplos estilos
  pace?: SuggestionPace;
  notes?: string;
};

export type SuggestionResult = {
  days: SuggestedDay[];
  usedAI: boolean;
  error?: string;
};

export async function generateItinerarySuggestion(
  input: SuggestionInput,
): Promise<SuggestionResult> {
  try {
    const prompt = buildUserPrompt(input);
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: appendSafetyRules(SYSTEM_PROMPT, true) },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      timeoutMs: 120_000, // 2min — roteiros grandes (7+ dias) podem demorar
    });

    return { days: parseAIResponse(raw), usedAI: true };
  } catch (err: any) {
    console.warn('[itinerarySuggester] erro:', err);
    // Mensagens amigáveis pra erros comuns
    let message = err?.message ?? String(err);
    if (err?.name === 'AbortError' || message.includes('Aborted') || message.includes('abort')) {
      message = 'A geração demorou demais ou foi interrompida. Tente de novo sem minimizar nos primeiros segundos.';
    } else if (message.includes('401') || message.includes('apiKey') || message.includes('OPENAI_API_KEY')) {
      message = 'Chave OpenAI não configurada ou inválida. Verifique o .env.';
    } else if (message.includes('429')) {
      message = 'Muitas requisições. Aguarde alguns segundos e tente de novo.';
    } else if (message.includes('Network') || message.includes('fetch') || message.includes('ENOTFOUND') || message.includes('Failed to fetch')) {
      message = 'Sem conexão com a internet. Verifique sua rede e tente de novo.';
    }
    return {
      days: [],
      usedAI: false,
      error: message,
    };
  }
}

function buildUserPrompt(input: SuggestionInput): string {
  const styleLabels: Record<SuggestionStyle, string> = {
    tourist: 'turístico (pontos clássicos)',
    gastronomic: 'gastronômico (restaurantes, mercados, comida local)',
    romantic: 'romântico (vistas, jantares charmosos)',
    family: 'família (atividades pra crianças, parques)',
    adventure: 'aventura (natureza, atividades ao ar livre)',
    cultural: 'cultural (museus, história, arquitetura)',
  };
  const paceLabels: Record<SuggestionPace, string> = {
    relaxed: 'relaxado',
    balanced: 'equilibrado',
    intense: 'intenso',
  };

  const parts = [
    `Destino: ${input.destination}`,
    `Número de dias: ${input.days}`,
  ];
  const allStyles = input.styles ?? (input.style ? [input.style] : []);
  if (allStyles.length > 0) {
    const labels = allStyles.map((s) => styleLabels[s]).join(', ');
    parts.push(`Estilo: ${labels}`);
  }
  if (input.pace) parts.push(`Ritmo: ${paceLabels[input.pace]}`);
  if (input.notes?.trim()) parts.push(`Observações: ${input.notes.trim()}`);

  return parts.join('\n');
}

function parseAIResponse(raw: string): SuggestedDay[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const days = Array.isArray(parsed?.days) ? parsed.days : [];

  return days
    .map((d: any, idx: number): SuggestedDay | null => {
      const title = sanitizeString(d?.title);
      const items = Array.isArray(d?.items) ? d.items : [];

      const sanitizedItems = items
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

      if (sanitizedItems.length === 0) return null;

      return {
        dayNumber: typeof d?.dayNumber === 'number' ? d.dayNumber : idx + 1,
        title: title ?? `Dia ${idx + 1}`,
        summary: sanitizeString(d?.summary),
        items: sanitizedItems,
      };
    })
    .filter((d: SuggestedDay | null): d is SuggestedDay => d !== null);
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
