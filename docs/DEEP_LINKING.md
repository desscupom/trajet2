# Deep Linking — Trajet

O app responde a dois tipos de URL pra abrir conteúdo direto numa tela:

| Tipo | Exemplo | Funciona em |
|---|---|---|
| Scheme nativo | `trajet://p/abc123` | App instalado (qualquer plataforma) |
| Universal link (HTTPS) | `https://trajet.app/p/abc123` | App instalado **OU** fallback no browser |

## Estado atual

**Funciona**:
- `trajet://p/<token>` — abre direto a tela `app/p/[token]/index.tsx`
- `trajet://invite/<token>` — convite pra viagem

**Não funciona ainda** (precisa de configuração extra):
- `https://trajet.app/p/<token>` — precisa de domínio hospedado com `apple-app-site-association` e `assetlinks.json`

## Como ativar Universal Links (HTTPS)

### 1. Publicar página web em `trajet.app`

Hospede uma página estática em `https://trajet.app/p/<token>` que:
- Renderize a viagem (chama `https://...supabase.co/functions/v1/public-trip?token=...`)
- Ou redirecione pro app via `<meta http-equiv="refresh">` se não tem app

### 2. Arquivo `apple-app-site-association` (iOS)

Crie e sirva em `https://trajet.app/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAM_ID.com.trajet.app"],
        "components": [
          { "/": "/p/*" },
          { "/": "/invite/*" }
        ]
      }
    ]
  }
}
```

Substitua `TEAM_ID` pelo Team ID da sua conta Apple Developer (10 caracteres alfanuméricos).

Sirva com `Content-Type: application/json` (sem extensão `.json` no arquivo).

### 3. Arquivo `assetlinks.json` (Android)

Crie e sirva em `https://trajet.app/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.trajet.app",
    "sha256_cert_fingerprints": ["SHA256_FINGERPRINT_DO_KEYSTORE"]
  }
}]
```

Pra pegar o fingerprint:
```bash
# Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android

# Release keystore (do EAS Build)
eas credentials
```

### 4. Configurar `.env`

Quando tudo estiver hospedado, no `.env`:

```
EXPO_PUBLIC_PUBLIC_VIEWER_URL=https://trajet.app/p
```

Isso faz o app gerar links HTTPS em vez do scheme nativo.

### 5. Build de produção

Universal links só funcionam em **builds de produção** (EAS Build), não em Expo Go.

```bash
eas build --platform all
```

## Testar localmente

Sem precisar de domínio público:

```bash
# Android
adb shell am start -W -a android.intent.action.VIEW -d "trajet://p/abc123" com.trajet.app

# iOS Simulator
xcrun simctl openurl booted "trajet://p/abc123"
```

Ou via Expo Go: `expo start` → escaneia QR code, depois manda URL `trajet://p/abc123` por qualquer mensageiro e clica.

## Como funciona internamente

O Expo Router já trata deep links automaticamente:
- URL `trajet://p/abc123` → roteia pra `app/p/[token]/index.tsx` com `token=abc123`
- URL `https://trajet.app/p/abc123` → mesma coisa (quando configurado)
- URL `trajet://invite/abc123` → `app/invite/[token]/index.tsx`

O `app/_layout.tsx` permite essas rotas mesmo sem autenticação (não força login).

## Configurações já feitas

`app.json` já tem:
- `scheme: "trajet"` — habilita `trajet://`
- `ios.associatedDomains: ["applinks:trajet.app"]` — habilita universal links iOS
- `android.intentFilters` com `autoVerify: true` pra `https://trajet.app/p/*` e `/invite/*`
