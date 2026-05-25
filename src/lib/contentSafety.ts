/**
 * Regras de conteúdo seguro aplicadas a TODOS os prompts de IA do Trajet.
 * Garante conformidade com as diretrizes da Apple App Store e Google Play.
 */

export const CONTENT_SAFETY_RULES = `

REGRAS DE CONTEÚDO (OBRIGATÓRIAS):
- Responda APENAS sobre planejamento de viagens, destinos, roteiros, hospedagem, transporte, gastronomia, cultura e orçamento.
- Use linguagem respeitosa e adequada para todas as idades.
- Nunca gere conteúdo sexual, violento, sobre drogas ou inapropriado.
- Seja factual sobre riscos de segurança em destinos, sem exagerar.
- Se o usuário desviar do tema de viagens, recuse educadamente.`;

/**
 * Adiciona regras de segurança ao final do system prompt.
 * Para prompts que retornam JSON, usa versão compacta para não interferir no formato.
 */
export function appendSafetyRules(basePrompt: string, jsonMode = false): string {
  if (jsonMode) {
    // Versão ultra-compacta para não confundir o modelo em modo JSON
    return basePrompt + '\n\nIMPORTANTE: Responda apenas sobre viagens. Conteúdo inadequado é proibido. Mantenha o formato JSON especificado.';
  }
  return basePrompt + CONTENT_SAFETY_RULES;
}
