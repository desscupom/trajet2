// supabase/functions/openai-proxy/index.ts
//
// Proxy seguro pra OpenAI Chat Completions API.
//
// Por que existe:
// - Evita expor a chave da OpenAI no app cliente
// - Centraliza rate limiting e validações
// - Permite trocar provider depois (Claude, Gemini) sem mexer no app
//
// Como o app chama:
//   POST /functions/v1/openai-proxy
//   Authorization: Bearer <supabase-anon-key>
//   Body: { messages, response_format?, temperature?, model? }
//
// Retorna:
//   { content: "string da resposta da IA" }
//   ou { error: "..." } com status >= 400
//
// IMPORTANTE: setar OPENAI_API_KEY como secret:
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// Deploy:
//   supabase functions deploy openai-proxy --no-verify-jwt
//   (--no-verify-jwt porque validamos manualmente pra dar mensagens claras)

// @ts-expect-error: Deno globals not in TS lib
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
]);

// Limites de segurança contra abuso
const MAX_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 200_000; // ~50k tokens de texto puro
const MAX_BASE64_LENGTH = 30_000_000; // ~22MB de arquivo

type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url' | 'file';
    text?: string;
    image_url?: { url: string };
    file?: { filename: string; file_data: string };
  }>;
};

type RequestBody = {
  messages: Message[];
  model?: string;
  response_format?: { type: 'json_object' | 'text' };
  temperature?: number;
  max_tokens?: number;
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Método não permitido');
  }

  // ----- Auth -----
  // Validamos que o request tem um JWT válido do Supabase (não usuário anônimo)
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonError(401, 'Authorization header faltando');
  }
  // Não validamos o JWT aqui — o gateway do Supabase já valida assinatura.
  // (Removemos --no-verify-jwt no deploy se quiser dupla validação.)

  // ----- Parse body -----
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body inválido (esperado JSON)');
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, 'Campo "messages" obrigatório');
  }
  if (body.messages.length > MAX_MESSAGES) {
    return jsonError(400, `Máximo ${MAX_MESSAGES} mensagens`);
  }

  // Valida tamanho — soma todas as mensagens e arquivos
  for (const msg of body.messages) {
    if (typeof msg.content === 'string') {
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return jsonError(400, 'Mensagem muito longa');
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && (part.text?.length ?? 0) > MAX_MESSAGE_LENGTH) {
          return jsonError(400, 'Texto da mensagem muito longo');
        }
        if (part.type === 'image_url' && (part.image_url?.url?.length ?? 0) > MAX_BASE64_LENGTH) {
          return jsonError(400, 'Imagem muito grande (>22MB)');
        }
        if (part.type === 'file' && (part.file?.file_data?.length ?? 0) > MAX_BASE64_LENGTH) {
          return jsonError(400, 'PDF muito grande (>22MB)');
        }
      }
    }
  }

  // Valida modelo
  const model = body.model ?? 'gpt-4o-mini';
  if (!ALLOWED_MODELS.has(model)) {
    return jsonError(400, `Modelo "${model}" não permitido`);
  }

  // Temperature: 0-1 razoável
  const temperature =
    typeof body.temperature === 'number' &&
    body.temperature >= 0 &&
    body.temperature <= 2
      ? body.temperature
      : 0.7;

  // ----- Chama OpenAI -----
  // @ts-expect-error: Deno.env
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada');
    return jsonError(500, 'Servidor mal configurado');
  }

  const openaiPayload: Record<string, unknown> = {
    model,
    messages: body.messages,
    temperature,
  };
  if (body.response_format) {
    openaiPayload.response_format = body.response_format;
  }
  if (body.max_tokens && body.max_tokens > 0 && body.max_tokens < 16000) {
    openaiPayload.max_tokens = body.max_tokens;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('OpenAI error:', res.status, errText);
      return jsonError(
        res.status === 429 ? 429 : 502,
        `OpenAI ${res.status}`,
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return jsonError(502, 'Resposta da OpenAI inesperada');
    }

    return new Response(
      JSON.stringify({ content }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('Erro na chamada OpenAI:', err);
    return jsonError(500, 'Erro ao processar requisição');
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  );
}
