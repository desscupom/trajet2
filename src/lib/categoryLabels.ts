/**
 * Traduz códigos de categoria (vindo da IA ou OSM) pra labels pt-BR.
 *
 * Usado em:
 * - Lugares sugeridos por IA (sight, food, shopping, nature, museum, nightlife, other)
 * - Lugares importados de OSM (mesmas categorias)
 * - Despesas (food, transport, lodging, etc — outro mapeamento, em ExpensesTab)
 *
 * Pra adicionar: edita o objeto CATEGORY_LABELS_PT abaixo.
 */

export const CATEGORY_LABELS_PT: Record<string, string> = {
  // Categorias da IA / OSM
  sight: 'Ponto turístico',
  sights: 'Ponto turístico',
  food: 'Comida',
  restaurant: 'Restaurante',
  cafe: 'Café',
  shopping: 'Compras',
  shop: 'Loja',
  nature: 'Natureza',
  park: 'Parque',
  museum: 'Museu',
  nightlife: 'Vida noturna',
  bar: 'Bar',
  entertainment: 'Entretenimento',
  beach: 'Praia',
  viewpoint: 'Mirante',
  monument: 'Monumento',
  church: 'Igreja',
  attraction: 'Atração',
  hotel: 'Hotel',
  lodging: 'Hospedagem',
  transport: 'Transporte',
  other: 'Outro',
};

/**
 * Traduz categoria pra pt-BR.
 * Se não conhecer a categoria, retorna o próprio valor capitalizado.
 */
export function translateCategory(category: string | null | undefined): string {
  if (!category) return '';
  const lower = category.toLowerCase().trim();
  if (CATEGORY_LABELS_PT[lower]) return CATEGORY_LABELS_PT[lower];
  // Capitaliza primeira letra como fallback
  return category.charAt(0).toUpperCase() + category.slice(1);
}
