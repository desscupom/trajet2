import {
  Car,
  DollarSign,
  Dumbbell,
  Fuel,
  Gift,
  Heart,
  Hotel,
  Music,
  Plane,
  ShoppingBag,
  Tag,
  Ticket,
  UtensilsCrossed,
} from '@/components/Icon';
import { EXPENSE_CATEGORIES } from '@/lib/expenses';

/**
 * Ícones disponíveis pra usar em categorias (built-in + custom).
 * Usado no picker de ícone quando o user cria nova categoria.
 */
export const CATEGORY_ICON_MAP = {
  Hotel,
  UtensilsCrossed,
  Car,
  Ticket,
  ShoppingBag,
  DollarSign,
  // ícones extras pra categorias custom
  Tag,
  Gift,
  Music,
  Heart,
  Plane,
  Fuel,
  Dumbbell,
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICON_MAP;

/**
 * Lista de ícones que o user pode escolher ao criar uma categoria custom.
 * Excluímos os que já são "fortemente associados" às categorias built-in
 * pra evitar confusão visual.
 */
export const CUSTOM_ICON_OPTIONS: CategoryIconName[] = [
  'Tag',
  'Gift',
  'Music',
  'Heart',
  'Plane',
  'Fuel',
  'Dumbbell',
  'Ticket',
  'ShoppingBag',
];

/**
 * Resolve um componente de ícone a partir do nome (string).
 * Fallback pra Tag se o nome não existe (ex: ícone foi removido).
 */
export function getIconByName(iconName: string | null | undefined) {
  if (!iconName) return Tag;
  const Icon = CATEGORY_ICON_MAP[iconName as CategoryIconName];
  return Icon ?? Tag;
}

/**
 * Pra categoria built-in (lookup por value).
 * Aceita também valores que NÃO estão na lista built-in (custom slugs):
 * nesse caso, retorna `Tag` por padrão (resolve no caller pelo iconName real).
 */
export function getCategoryIcon(value: string | null | undefined) {
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === value);
  if (cat) return getIconByName(cat.iconName);
  return Tag;
}

export function getCategoryLabel(value: string | null | undefined): string {
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === value);
  return cat?.label ?? 'Outros';
}

/**
 * @deprecated use `useExpenseCategories` que já resolve ícone via getIconByName.
 */
export function getAllCategoriesWithIcons() {
  return EXPENSE_CATEGORIES.map((c) => ({
    ...c,
    Icon: getIconByName(c.iconName),
  }));
}
