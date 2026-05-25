# 🌐 Trajet Viewer Web

Páginas estáticas hospedadas em `trajet.app` que fazem o viewer público das viagens compartilhadas + universal links pra abrir o app.

## ⚡ Deploy em 5 minutos (Vercel)

### Pré-requisitos
- Conta Vercel grátis: https://vercel.com/signup
- Node.js instalado

### Passo a passo

```bash
# 1. Instala Vercel CLI (uma vez)
npm install -g vercel

# 2. Login (abre browser)
vercel login

# 3. Da pasta `web` do projeto:
cd web
vercel --prod
```

Pronto. Vercel te dá uma URL tipo `trajet-viewer.vercel.app`. **Pode usar essa URL diretamente** — funciona já.

### Testar

Abra no browser:
```
https://<sua-url>.vercel.app/p/?token=<TOKEN_DO_LINK>
```

(Pegue um token gerando um link público no app)

## 🌍 Domínio próprio (trajet.app)

Quando quiser ter URL `https://trajet.app/p/...`:

1. **Compre domínio**: Namecheap, Cloudflare Registrar, ou outro (~$15/ano pra `.app`)
2. **Adiciona na Vercel**: 
   - Dashboard → Settings → Domains → Add
3. **Configura DNS** conforme Vercel mostrar (geralmente A record + CNAME)
4. **Vercel emite SSL** automaticamente em ~5min

## 📱 Universal Links (abre no app instalado)

Pra `https://trajet.app/p/<token>` abrir direto no app instalado em vez do browser:

### iOS

Edite `.well-known/apple-app-site-association`:
```diff
- "appIDs": ["__TEAM_ID__.com.trajet.app"]
+ "appIDs": ["ABCD1234EF.com.trajet.app"]
```

`ABCD1234EF` = Team ID da sua Apple Developer account.  
Encontrar: https://developer.apple.com/account → Membership → Team ID

### Android

Edite `.well-known/assetlinks.json`:
```diff
"sha256_cert_fingerprints": [
- "__SHA256_FINGERPRINT_DEBUG__",
- "__SHA256_FINGERPRINT_RELEASE__"
+ "AA:BB:CC:DD:..." 
]
```

Pegar fingerprints:
```bash
# Para builds EAS:
eas credentials
# Selecione platform Android → Production → mostra SHA-256
```

### Re-deploy
```bash
cd web && vercel --prod
```

### No app
Edite `trajet/.env`:
```
EXPO_PUBLIC_PUBLIC_VIEWER_URL=https://trajet.app/p
```

Faça novo EAS Build:
```bash
eas build --platform all
```

## 🛠️ Configuração

Edite `p/config.js` se quiser mudar:
- URL do Supabase
- Cor primária
- Nome do app
- Domínio público

Não precisa rebuild — só re-deploy `vercel --prod`.

## 📁 Estrutura

```
web/
├── index.html                          ← landing root (trajet.app)
├── p/
│   ├── index.html                      ← viewer (trajet.app/p/<token>)
│   └── config.js                       ← URL Supabase, cores, etc
├── .well-known/
│   ├── apple-app-site-association      ← iOS universal links
│   └── assetlinks.json                 ← Android app links
├── vercel.json                         ← rewrites + headers
├── deploy.sh                           ← script de deploy automatizado
└── README.md                           ← este arquivo
```

## 💰 Custos

| Item | Custo |
|---|---|
| Vercel Free | $0 (100GB bandwidth/mês — milhares de visitas) |
| Domínio `.app` | ~$15/ano (opcional) |
| SSL | Grátis (Vercel + Let's Encrypt automático) |

**Total mínimo: zero. Total com domínio próprio: ~$15/ano.**

## 🐛 Troubleshooting

**"Edge Function returned 404"**  
Você não deployou as Edge Functions ainda. Vai pra raiz do projeto:
```bash
cd ..
supabase functions deploy public-trip --no-verify-jwt
```

**"Universal link não abre no app"**  
- Confirme que app está instalado
- Apple/Android leva ~24h pra "indexar" o arquivo `.well-known`
- Em iOS, force re-validar: desinstale e reinstale o app
- Validador: https://branch.io/resources/aasa-validator/

**"Página em branco"**  
Abra o console do browser. Geralmente é problema de CORS ou Edge Function não deployada.

## 🧪 Testar localmente (sem deploy)

```bash
cd web
python3 -m http.server 8000
# Ou: npx serve .
```

Acesse `http://localhost:8000/p/?token=SEU_TOKEN`.
