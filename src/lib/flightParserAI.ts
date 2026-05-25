import type { AttachedFile } from '@/lib/fileAttachment';
import { toDataUrl } from '@/lib/fileAttachment';
import type { ParsedFlight } from '@/lib/flightParser';
import { type ChatContentPart, callOpenAI } from '@/lib/openaiClient';

/**
 * Parser de voos via IA (OpenAI).
 *
 * Usa o cliente unificado em `openaiClient.ts` — funciona em modo DIRECT
 * (chave no app) ou PROXY (chave no servidor via Edge Function).
 *
 * Custo: ~$0.0005 por importação só texto, ~$0.002 com imagem/PDF.
 */

const SYSTEM_PROMPT = `Você extrai informações de voos a partir de textos colados (emails de reserva, prints, mensagens).

REGRAS:
- Responda APENAS com JSON válido, sem comentários ou markdown.
- Detecte TODOS os voos no texto (ida, volta, conexões).
- Use formato YYYY-MM-DD para datas e HH:MM (24h) para horários.
- Aeroportos em código IATA de 3 letras maiúsculas (GRU, MAD, JFK, etc).
- Se um campo não estiver claro no texto, use null. NÃO invente.

SCHEMA DE SAÍDA:
{
  "flights": [
    {
      "flightCode": "LA3024",
      "airline": "LATAM",
      "fromAirport": "GRU",
      "toAirport": "MAD",
      "departureDate": "2026-06-15",
      "departureTime": "22:30",
      "arrivalTime": "14:15",
      "reservationCode": "ABC123"
    }
  ]
}

Se não conseguir detectar nenhum voo, retorne {"flights": []}.`;

export type AIParseResult = {
  flights: ParsedFlight[];
  usedAI: boolean;
  error?: string;
};

export async function parseFlightsWithAI(
  text: string,
  file?: AttachedFile | null,
): Promise<AIParseResult> {
  if (!text?.trim() && !file) {
    return { flights: [], usedAI: false };
  }

  try {
    const userContent = buildUserContent(text, file);
    const raw = await callOpenAI({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const flights = parseAIResponse(raw, text);
    return { flights, usedAI: true };
  } catch (err: any) {
    console.warn('[flightParserAI] erro:', err);
    return {
      flights: [],
      usedAI: false,
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Constrói o content array da mensagem (texto + arquivo opcional).
 */
function buildUserContent(
  text: string,
  file?: AttachedFile | null,
): ChatContentPart[] | string {
  // Se só tem texto, retorna string simples (mais leve no payload)
  if (text.trim() && !file) {
    return text;
  }

  const parts: ChatContentPart[] = [];
  if (text.trim()) {
    parts.push({ type: 'text', text });
  }
  if (file) {
    if (file.mimeType.startsWith('image/')) {
      parts.push({
        type: 'image_url',
        image_url: { url: toDataUrl(file) },
      });
    } else if (file.mimeType === 'application/pdf') {
      parts.push({
        type: 'file',
        file: {
          filename: file.name,
          file_data: toDataUrl(file),
        },
      });
    } else {
      throw new Error(
        `Tipo de arquivo não suportado: ${file.mimeType}. Use PDF ou imagem.`,
      );
    }
  }
  if (parts.length === 0) {
    throw new Error('Nada pra analisar.');
  }
  return parts;
}

function parseAIResponse(raw: string, originalText: string): ParsedFlight[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[flightParserAI] JSON inválido:', raw);
    return [];
  }

  const flights = Array.isArray(parsed?.flights) ? parsed.flights : [];

  return flights
    .map((f: any): ParsedFlight | null => {
      const flightCode = sanitizeString(f?.flightCode);
      const fromAirport = sanitizeAirport(f?.fromAirport);
      const toAirport = sanitizeAirport(f?.toAirport);

      if (!flightCode && !(fromAirport && toAirport)) return null;

      return {
        flightCode,
        airline: sanitizeString(f?.airline),
        fromAirport,
        toAirport,
        departureDate: sanitizeDate(f?.departureDate),
        departureTime: sanitizeTime(f?.departureTime),
        arrivalTime: sanitizeTime(f?.arrivalTime),
        reservationCode: sanitizeString(f?.reservationCode),
        rawSnippet: originalText.slice(0, 500),
      };
    })
    .filter((f: ParsedFlight | null): f is ParsedFlight => f !== null);
}

function sanitizeString(v: any): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== 'null' ? t : null;
}

function sanitizeAirport(v: any): string | null {
  const s = sanitizeString(v);
  if (!s) return null;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

function sanitizeDate(v: any): string | null {
  const s = sanitizeString(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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
