# Push Remoto — Guia de Ativação

Hoje o Trajet tem **notificações in-app via realtime**: quando outra pessoa
da viagem adiciona um lugar, despesa ou entra como membro, e você está com
o app **aberto**, aparece um toast.

Pra receber **push remoto** (com app fechado / device bloqueado), você
precisa fazer 4 passos. Cada um leva ~5-10 minutos.

## Pré-requisitos

- Conta Expo (gratuita): https://expo.dev/signup
- Conta de desenvolvedor Apple ($99/ano) se for buildar pra iOS
- Para Android, basta uma conta Google e Expo lida com o resto

## Passo 1: Fazer um dev build (EAS Build)

Push remoto **não funciona em Expo Go** desde o SDK 53. Precisa de um build
custom.

```bash
# Instala o EAS CLI
npm install -g eas-cli

# Login
eas login

# Configura o projeto (gera eas.json)
eas build:configure

# Build de desenvolvimento (vai rodar nos servidores da Expo)
eas build --profile development --platform android   # ou ios
```

O build leva ~15min. No final você baixa um APK (Android) ou pega via
TestFlight (iOS) e instala no device. Esse build SUBSTITUI o Expo Go.

A partir daí você roda `npx expo start` normalmente, mas a app que abre
é a sua build custom (que SUPORTA push remoto).

## Passo 2: Deployar a Edge Function

A edge function `send-push-on-activity` está em
`supabase/functions/send-push-on-activity/index.ts` e ela já faz tudo:
busca os membros, filtra por preferências, dispara via Expo Push API.

```bash
# Login no Supabase CLI
npx supabase login

# Linka esse projeto
npx supabase link --project-ref sakwdwdqsswblwqjtqth

# Deploya a função
npx supabase functions deploy send-push-on-activity --no-verify-jwt
```

O `--no-verify-jwt` é necessário porque vamos chamar essa função via
trigger do banco (que não envia JWT).

## Passo 3: Habilitar pg_net no Supabase

A trigger no banco precisa fazer chamadas HTTP. Isso requer a extensão
`pg_net`:

1. Vai no [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto
2. Database → Extensions
3. Procura `pg_net`, clica em "Enable"

## Passo 4: Aplicar a migration de triggers

A migration `017_push_triggers_DISABLED.sql` está em
`supabase/migrations/`. Por padrão TODO o conteúdo está comentado.

Pra ativar:

1. Abre o arquivo `supabase/migrations/017_push_triggers_DISABLED.sql`
2. Remove o `/*` do início e `*/` do fim do bloco
3. Substitui `YOUR_PROJECT_REF` pela URL do seu projeto
   (no nosso caso: `sakwdwdqsswblwqjtqth`)
4. Renomeia o arquivo pra remover o `_DISABLED` (boa prática)
5. Aplica a migration:

```bash
npx supabase db push
```

Ou cole o SQL no SQL Editor do Dashboard manualmente.

## Pronto! Como testar

1. Abre o dev build em 2 devices diferentes (ou device + simulador), com
   2 contas diferentes que são membros da mesma viagem
2. Em um, vai pra Settings → Notificações e ATIVA todas
3. No outro, adiciona uma despesa
4. O primeiro device deve receber um push (mesmo com o app fechado)

## Como debugar se der errado

```bash
# Logs da edge function
npx supabase functions logs send-push-on-activity

# Ver tokens registrados
# Cole no SQL Editor:
select profile_id, platform, created_at from public.push_tokens;
```

Se `push_tokens` está vazia: o `registerPushToken` não tá rodando. Verifica
se você está em dev build (não Expo Go) e se deu permissão de notificação.

Se a função roda mas não envia: olha os logs — provavelmente o token tá
inválido ou a Expo Push API rejeitou.
