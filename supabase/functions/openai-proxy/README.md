# Edge Function: openai-proxy

Proxy seguro pra chamar a OpenAI API sem expor a chave no app cliente.

## Por que usar

Antes desta função, o app fazia `fetch('https://api.openai.com/v1/chat/completions', ...)` direto, com a chave no `.env` (`EXPO_PUBLIC_OPENAI_API_KEY`). Problema: qualquer um que decompila o APK/IPA do app extrai a chave.

Com esta função, a chave fica no **servidor** (variável de ambiente do Supabase) e o app só conhece a URL do proxy.

## Setup inicial (uma vez só)

Se ainda não tem o Supabase CLI:

```bash
brew install supabase/tap/supabase
# ou
npm install -g supabase
```

Faça login:

```bash
supabase login
```

Linka o projeto local com o remoto (rodar **da raiz do projeto trajet**):

```bash
supabase link --project-ref sakwdwdqsswblwqjtqth
```

## Deploy

```bash
# 1. Configurar a chave da OpenAI como secret do projeto (uma vez só)
supabase secrets set OPENAI_API_KEY=sk-proj-...

# 2. Deploy da função
supabase functions deploy openai-proxy
```

## Ativar no app

Edite o `.env`:

```diff
- EXPO_PUBLIC_USE_EDGE_FUNCTION=false
+ EXPO_PUBLIC_USE_EDGE_FUNCTION=true
```

E **idealmente** remova a chave da OpenAI do `.env` (não precisa mais):

```diff
- EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
```

Restart o Expo (`npx expo start --clear`).

## Como testar

```bash
curl -X POST \
  "https://sakwdwdqsswblwqjtqth.supabase.co/functions/v1/openai-proxy" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Diga olá em 3 palavras"}
    ]
  }'
```

Deve retornar `{ "content": "Oi, tudo bem?" }` ou similar.

## Logs

```bash
supabase functions logs openai-proxy
```

## Custos

Continua o mesmo custo da OpenAI (~$0.0005 por chamada com gpt-4o-mini). A Edge Function em si é gratuita no Free plan do Supabase (500k invocações/mês).
