#!/bin/bash
# deploy.sh — Deploy do viewer web do Trajet pra Vercel
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requer: vercel CLI instalado (`npm i -g vercel`)

set -e  # Para no primeiro erro

echo "🚀 Deploy do viewer Trajet"
echo ""

# Verifica vercel CLI
if ! command -v vercel &> /dev/null; then
  echo "❌ Vercel CLI não encontrado."
  echo "   Instale com: npm install -g vercel"
  exit 1
fi

# Verifica que está dentro da pasta web
if [ ! -f "./vercel.json" ]; then
  echo "❌ Rode este script de dentro da pasta web/"
  echo "   Use: cd web && ./deploy.sh"
  exit 1
fi

# Confirma config
echo "📋 Verificando configuração em p/config.js..."
if grep -q "sakwdwdqsswblwqjtqth" p/config.js; then
  echo "   ✓ SUPABASE_URL configurada"
else
  echo "   ⚠️  Verifique p/config.js antes de continuar"
fi

# Confirma well-known files
if grep -q "__TEAM_ID__" .well-known/apple-app-site-association; then
  echo "   ⚠️  apple-app-site-association ainda tem __TEAM_ID__ — substitua pelo Team ID Apple antes do deploy final"
fi
if grep -q "__SHA256_FINGERPRINT" .well-known/assetlinks.json; then
  echo "   ⚠️  assetlinks.json ainda tem __SHA256_FINGERPRINT — substitua pelo fingerprint do app Android"
fi

echo ""
echo "🔨 Iniciando deploy..."
echo ""

# Deploy de produção
vercel --prod

echo ""
echo "✅ Deploy completo!"
echo ""
echo "📌 Próximos passos:"
echo "   1. Aponte um domínio (ex: trajet.app) pra esse deploy"
echo "      → Settings → Domains na dashboard Vercel"
echo "   2. Configure DNS conforme instruções"
echo "   3. No app, edite .env:"
echo "      EXPO_PUBLIC_PUBLIC_VIEWER_URL=https://trajet.app/p"
echo "   4. Faça novo EAS Build pra ativar universal links"
