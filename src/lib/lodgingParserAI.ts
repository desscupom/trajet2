import type { AttachedFile } from '@/lib/fileAttachment';
import { toDataUrl } from '@/lib/fileAttachment';
import { type ChatContentPart, callOpenAI } from '@/lib/openaiClient';

/**
 * Parser de hospedagens via IA (OpenAI).
 *
 * Mesma estratégia do flightParserAI mas pra hospedagens.
 */

const SYSTEM_PROMPT = `Você extrai informações de hospedagens (hotel, Airbnb, hostel, pousada, casa) a partir de textos, prints ou PDFs de reservas.

REGRAS:
- Responda APENAS com JSON válido, sem comentários nem markdown.
- Detecte TODAS as hospedagens no conteúdo.
- Use formato YYYY-MM-DD para datas e HH:MM (24h) para horários.
- Se um campo não estiver claro, use null. NÃO invente.
- Para tipo (kind), classifique como: "hotel", "airbnb", "hostel", "house", "other".

SCHEMA DE SAÍDA:
{
  "lodgings": [
    {
      "name": "Hotel Ibis São Paulo",
      "kind": "hotel",
      "address": "Av Paulista, 2000",
      "checkInAt": "2026-05-10T15:00",
      "checkOutAt": "2026-05-15T11:00",
      "reservationCode": "ABC123",
      "costAmount": 1250.50,
      "costCurrency": "BRL",
      "notes": "Café da manhã incluso"
    }
  ]
}

DICAS:
- Se a hora não estiver no documento, use 15:00 (in) e 11:00 (out).
- Airbnb: textos com "host", "anfitrião", "propriedade" → kind="airbnb".
- Se não detectar nenhuma hospedagem, retorne {"lodgings": []}.`;

export type ParsedLodging = {
  name: string;
  kind: 'hotel' | 'airbnb' | 'hostel' | 'house' | 'other';
  address: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  reservationCode: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  notes: string | null;
};

export type AILodgingParseResult = {
  lodgings: ParsedLodging[];
  usedAI: boolean;
  error?: string;
};

export async function parseLodgingsWithAI(
  text: string,
  file?: AttachedFile | null,
): Promise<AILodgingParseResult> {
  if (!text?.trim() && !file) {
    return { lodgings: [], usedAI: false };
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

    const lodgings = parseAIResponse(raw);
    return { lodgings, usedAI: true };
  } catch (err: any) {
    console.warn('[lodgingParserAI] erro:', err);
    return {
      lodgings: [],
      usedAI: false,
      error: err?.message ?? String(err),
    };
  }
}

function buildUserContent(
  text: string,
  file?: AttachedFile | null,
): ChatContentPart[] | string {
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
        file: { filename: file.name, file_data: toDataUrl(file) },
      });
    } else {
      throw new Error(
        `Tipo de arquivo não suportado: ${file.mimeType}.`,
      );
    }
  }
  if (parts.length === 0) {
    throw new Error('Nada pra analisar.');
  }
  return parts;
}

function parseAIResponse(raw: string): ParsedLodging[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const lodgings = Array.isArray(parsed?.lodgings) ? parsed.lodgings : [];

  return lodgings
    .map((l: any): ParsedLodging | null => {
      const name = sanitizeString(l?.name);
      if (!name) return null;

      return {
        name,
        kind: sanitizeKind(l?.kind),
        address: sanitizeString(l?.address),
        checkInAt: sanitizeDateTime(l?.checkInAt),
        checkOutAt: sanitizeDateTime(l?.checkOutAt),
        reservationCode: sanitizeString(l?.reservationCode),
        costAmount: sanitizeNumber(l?.costAmount),
        costCurrency: sanitizeCurrency(l?.costCurrency),
        notes: sanitizeString(l?.notes),
      };
    })
    .filter((l: ParsedLodging | null): l is ParsedLodging => l !== null);
}

function sanitizeString(v: any): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== 'null' ? t : null;
}

function sanitizeKind(v: any): ParsedLodging['kind'] {
  const valid = ['hotel', 'airbnb', 'hostel', 'house', 'other'];
  return valid.includes(v) ? v : 'hotel';
}

function sanitizeDateTime(v: any): string | null {
  const s = sanitizeString(v);
  if (!s) return null;
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/,
  );
  if (!m) return null;
  const [, y, mo, d, h, min] = m;
  return `${y}-${mo}-${d}T${h ?? '15'}:${min ?? '00'}`;
}

function sanitizeNumber(v: any): number | null {
  if (typeof v === 'number' && !isNaN(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return !isNaN(n) && n >= 0 ? n : null;
  }
  return null;
}

function sanitizeCurrency(v: any): string | null {
  const s = sanitizeString(v);
  if (!s) return null;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}
