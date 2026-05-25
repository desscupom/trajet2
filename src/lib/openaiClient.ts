/**
 * Cliente unificado pra OpenAI Chat Completions.
 *
 * Dois modos:
 * - DIRECT: chama OpenAI direto do app (chave em EXPO_PUBLIC_OPENAI_API_KEY).
 *           Inseguro em produção — chave fica exposta.
 * - PROXY: chama via Edge Function `openai-proxy` no Supabase (chave no servidor).
 *           Seguro pra produção.
 *
 * Modo é decidido por `EXPO_PUBLIC_USE_EDGE_FUNCTION`:
 *   - 'true'  → PROXY
 *   - outro   → DIRECT
 *
 * Esta lib é usada por:
 * - flightParserAI
 * - lodgingParserAI
 * - itinerarySuggester
 * - suggestMorePlaces
 * - suggestLodgings
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<ChatContentPart>;
};

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export type OpenAIRequest = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  /** Default { type: 'json_object' } — força saída JSON */
  response_format?: { type: 'json_object' | 'text' };
  max_tokens?: number;
  /** Timeout em ms (default 30s, 60s se tem arquivo) */
  timeoutMs?: number;
};

const USE_EDGE_FUNCTION =
  process.env.EXPO_PUBLIC_USE_EDGE_FUNCTION === 'true';

/**
 * Chama a OpenAI (direto ou via proxy) e retorna o conteúdo da resposta.
 * Lança erro se a chamada falhar.
 */
export async function callOpenAI(req: OpenAIRequest): Promise<string> {
  const timeoutMs =
    req.timeoutMs ??
    (hasFileAttachment(req.messages) ? 90_000 : 60_000); // 60s padrão, 90s com arquivo

  if (USE_EDGE_FUNCTION) {
    return callViaEdgeFunction(req, timeoutMs);
  }
  return callDirect(req, timeoutMs);
}

/**
 * Detecta se alguma mensagem inclui arquivo (imagem ou PDF).
 * Usado pra ajustar timeout — Vision é mais lenta.
 */
function hasFileAttachment(messages: ChatMessage[]): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === 'image_url' || part.type === 'file') return true;
    }
  }
  return false;
}

async function callDirect(
  req: OpenAIRequest,
  timeoutMs: number,
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EXPO_PUBLIC_OPENAI_API_KEY não configurada. Configure no .env ou ative EXPO_PUBLIC_USE_EDGE_FUNCTION.',
    );
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> = {
    model: req.model ?? 'gpt-4o-mini',
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
  };
  if (req.response_format) {
    payload.response_format = req.response_format;
  }
  if (req.max_tokens) {
    payload.max_tokens = req.max_tokens;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Resposta inesperada da OpenAI');
    }
    return content;
  } finally {
    clearTimeout(tid);
  }
}

async function callViaEdgeFunction(
  req: OpenAIRequest,
  timeoutMs: number,
): Promise<string> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase não configurado');
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> = {
    messages: req.messages,
  };
  if (req.model) payload.model = req.model;
  if (req.temperature !== undefined) payload.temperature = req.temperature;
  if (req.response_format) payload.response_format = req.response_format;
  if (req.max_tokens) payload.max_tokens = req.max_tokens;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error) errMessage = parsed.error;
      } catch {
        // mantém texto bruto
      }
      throw new Error(`Edge function ${res.status}: ${errMessage.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data?.content;
    if (typeof content !== 'string') {
      throw new Error('Resposta inesperada da Edge Function');
    }
    return content;
  } finally {
    clearTimeout(tid);
  }
}
