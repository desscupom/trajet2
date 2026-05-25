# Edge Function: notification-pusher

Quando uma notification é INSERT-ada na tabela `notifications`, esta Edge Function:
1. Busca push tokens do user (`push_tokens` table)
2. Verifica preferências de notificação (respeita on/off por tipo)
3. Envia push remoto via Expo Push API
4. Limpa tokens "mortos" (DeviceNotRegistered)

## Por que existe

Os triggers do banco (migration 038) criam notifications **in-app** (badge no app), mas isso só é visto quando o user **abre o app**. Pra ter push remoto que toca o celular mesmo com app fechado, precisa de:
- Token Expo Push registrado (`push_tokens` table — já temos)
- Algo que dispare a push API quando algo importante acontece

Esse "algo" é esta Edge Function, disparada por **Database Webhook**.

## Deploy

```bash
supabase functions deploy notification-pusher
```

`SUPABASE_SERVICE_ROLE_KEY` é injetada automaticamente.

## Configurar o webhook

Pela UI do Supabase (não tem API ainda pra isso):

1. Acesse https://supabase.com/dashboard/project/sakwdwdqsswblwqjtqth/integrations/webhooks/overview
2. Clique em **Create new webhook**
3. Configure:
   - **Name**: `notification-pusher`
   - **Schema**: `public`
   - **Table**: `notifications`
   - **Events**: ✅ Insert (apenas)
   - **Type**: Supabase Edge Functions
   - **Method**: POST
   - **URL**: vai aparecer auto preenchido
   - **Edge Function**: `notification-pusher`
   - **HTTP Headers**: deixar padrão
   - **HTTP Params**: deixar vazio
   - **Timeout**: 5000ms (5s)
4. **Create webhook**

Depois disso, toda notification INSERT-ada dispara a function automaticamente.

## Testar

Crie uma notif manual (no app, ou via SQL):

```sql
insert into public.notifications (profile_id, type, title, body)
values (
  '<seu_user_id>',
  'other',
  'Teste de push',
  'Se você está vendo isso, push tá funcionando!'
);
```

Em ~1s, deve chegar push no seu device (se tem token registrado).

## Logs

```bash
supabase functions logs notification-pusher
```

Procure por:
- `skipped: no-tokens` — user não tem push tokens
- `skipped: user-disabled-all` — user desabilitou notif
- `skipped: user-disabled-type` — user desabilitou ESSE tipo
- `Removendo N tokens mortos` — tokens revogados pelo OS, removidos do banco
- `sent: N` — sucesso, N pushes enviados

## Custos

- Edge Function: free no plano Free (500k invocations/mês)
- Expo Push API: **grátis ilimitado**

## O que NÃO funciona

- **Expo Go**: push tokens registrados ali são "experimental" e podem expirar a qualquer momento. Pra produção, **precisa fazer EAS Build**.
- **Web**: Expo Push não cobre web. Pra web teria que integrar FCM/Web Push direto.
- **Notificações silenciosas / data-only**: esta function manda só push visíveis. Pra data-only, teria que ajustar.

## Loop infinito?

Não. A trigger só dispara em **INSERT** na notifications. A função **lê** push_tokens e **deleta** tokens mortos (DELETE em push_tokens, não INSERT em notifications). Sem chance de loop.
