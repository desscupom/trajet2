# deploy-supabase.ps1
# Deploy completo das Edge Functions Trajet + criação do webhook
#
# Uso:
#   cd "C:\Users\ctran\OneDrive\Área de Trabalho\trajet"
#   .\deploy-supabase.ps1
#
# Pré-requisito: Node.js instalado

$ErrorActionPreference = "Stop"
$PROJECT_ID = "sakwdwdqsswblwqjtqth"

Write-Host "`n🚀 Trajet — Deploy de Edge Functions" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1. Instala Supabase CLI se necessário
Write-Host "`n📦 Verificando Supabase CLI..." -ForegroundColor Yellow
try {
    $version = & npx supabase --version 2>&1
    Write-Host "   ✓ Supabase CLI encontrado: $version" -ForegroundColor Green
} catch {
    Write-Host "   Instalando Supabase CLI..." -ForegroundColor Yellow
    & npm install -g supabase
}

# 2. Login (abre browser)
Write-Host "`n🔑 Verificando login..." -ForegroundColor Yellow
$whoami = & npx supabase projects list 2>&1
if ($whoami -match "not logged in" -or $whoami -match "Login") {
    Write-Host "   Fazendo login (vai abrir o browser)..." -ForegroundColor Yellow
    & npx supabase login
} else {
    Write-Host "   ✓ Já logado" -ForegroundColor Green
}

# 3. Link com o projeto
Write-Host "`n🔗 Linkando com projeto $PROJECT_ID..." -ForegroundColor Yellow
& npx supabase link --project-ref $PROJECT_ID

# 4. Deploy das Edge Functions
Write-Host "`n⚡ Deployando Edge Functions..." -ForegroundColor Yellow

$functions = @(
    @{ name = "notification-pusher"; flags = "" },
    @{ name = "public-trip"; flags = "--no-verify-jwt" },
    @{ name = "openai-proxy"; flags = "" }
)

foreach ($fn in $functions) {
    Write-Host "`n   Deployando $($fn.name)..." -ForegroundColor Cyan
    if ($fn.flags) {
        & npx supabase functions deploy $fn.name $fn.flags
    } else {
        & npx supabase functions deploy $fn.name
    }
    Write-Host "   ✓ $($fn.name) deployado!" -ForegroundColor Green
}

# 5. Instruções do webhook
Write-Host "`n✅ Edge Functions deployadas!" -ForegroundColor Green
Write-Host "`n📌 PRÓXIMO PASSO: Criar o Database Webhook (1 min)" -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Acesse:" -ForegroundColor White
Write-Host "   https://supabase.com/dashboard/project/$PROJECT_ID/integrations/webhooks/overview" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Clique em 'Create new webhook'" -ForegroundColor White
Write-Host ""
Write-Host "3. Configure assim:" -ForegroundColor White
Write-Host "   Name:          notification-pusher" -ForegroundColor Yellow
Write-Host "   Schema:        public" -ForegroundColor Yellow
Write-Host "   Table:         notifications" -ForegroundColor Yellow
Write-Host "   Events:        ✅ Insert  (só Insert, desmarque Update/Delete)" -ForegroundColor Yellow
Write-Host "   Type:          Supabase Edge Functions" -ForegroundColor Yellow
Write-Host "   Edge Function: notification-pusher" -ForegroundColor Yellow
Write-Host "   Timeout:       5000 ms" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Clique 'Create webhook'" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Pronto! Após isso, toda notificação INSERT vai gerar push." -ForegroundColor Green
Write-Host ""
Write-Host "📊 Ver logs depois:" -ForegroundColor White
Write-Host "   npx supabase functions logs notification-pusher" -ForegroundColor Cyan
