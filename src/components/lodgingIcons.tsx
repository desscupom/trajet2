import {
  Bed,
  Building,
  Hotel,
  House,
  Tent,
} from '@/components/Icon';

import type { LodgingKind } from '@/lib/lodgings';

export const LODGING_KIND_ICONS: Record<
  LodgingKind,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  hotel: Hotel,
  airbnb: House,
  hostel: Building,
  house: House,
  other: Bed,
};

/** Ícone como Tent caso queira mostrar acampamento futuramente */
export { Tent };
