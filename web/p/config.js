/**
 * Configuração do viewer web Trajet.
 *
 * Edite estas variáveis ANTES de deployar.
 * Não precisa rebuild — basta atualizar este arquivo e re-deployar.
 */
window.TRAJET_CONFIG = {
  // URL da API Supabase do projeto
  SUPABASE_URL: 'https://sakwdwdqsswblwqjtqth.supabase.co',

  // Scheme do app pra "Abrir no Trajet" (mobile)
  APP_SCHEME: 'trajet://p/',

  // Nome do app pra exibir
  APP_NAME: 'Trajet',

  // Cor primária (igual ao app)
  PRIMARY_COLOR: '#0d9488',

  // Domínio público (usado em OG meta tags, opcional)
  // Se hospedar em outro lugar que não trajet.app, atualize aqui
  PUBLIC_DOMAIN: 'https://trajet.app',
};
