import type { Tables } from '@/lib/database.types';

export type Lodging = Tables<'lodgings'>;

export type LodgingKind = 'hotel' | 'airbnb' | 'hostel' | 'house' | 'other';

/** Labels de exibição por tipo */
export const LODGING_KIND_LABELS: Record<LodgingKind, string> = {
  hotel: 'Hotel',
  airbnb: 'Airbnb',
  hostel: 'Hostel',
  house: 'Casa',
  other: 'Outro',
};

/** Status de uma hospedagem em relação ao tempo presente */
export type LodgingStatus = 'upcoming' | 'current' | 'past' | 'undated';

/**
 * Calcula o status temporal da hospedagem.
 * - undated: sem datas
 * - upcoming: check-in no futuro
 * - current: check-in no passado, check-out no futuro (estamos hospedados!)
 * - past: check-out no passado
 */
export function getLodgingStatus(lodging: Pick<Lodging, 'check_in_at' | 'check_out_at'>): LodgingStatus {
  if (!lodging.check_in_at && !lodging.check_out_at) return 'undated';
  const now = Date.now();

  if (lodging.check_in_at) {
    const checkIn = new Date(lodging.check_in_at).getTime();
    if (lodging.check_out_at) {
      const checkOut = new Date(lodging.check_out_at).getTime();
      if (now < checkIn) return 'upcoming';
      if (now >= checkIn && now < checkOut) return 'current';
      return 'past';
    }
    // Só tem check-in
    return now < checkIn ? 'upcoming' : 'past';
  }

  // Só tem check-out (raro)
  return new Date(lodging.check_out_at!).getTime() > now ? 'upcoming' : 'past';
}

/** Conta noites entre check-in e check-out */
export function getNights(lodging: Pick<Lodging, 'check_in_at' | 'check_out_at'>): number {
  if (!lodging.check_in_at || !lodging.check_out_at) return 0;
  const inDate = new Date(lodging.check_in_at);
  const outDate = new Date(lodging.check_out_at);
  // Diferença em dias (arredondada)
  const diffMs = outDate.getTime() - inDate.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Formata "12 ago, 15:00" pra mostrar no card.
 * Locale pt-BR.
 */
export function formatLodgingDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date.replace('.', '')}, ${time}`;
}

/**
 * Formata só a data (sem hora). "12 ago"
 */
export function formatLodgingDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/**
 * Ordena hospedagens pelo check-in (asc), undated por último.
 */
export function sortLodgings(lodgings: Lodging[]): Lodging[] {
  return [...lodgings].sort((a, b) => {
    if (!a.check_in_at && !b.check_in_at) return 0;
    if (!a.check_in_at) return 1;
    if (!b.check_in_at) return -1;
    return new Date(a.check_in_at).getTime() - new Date(b.check_in_at).getTime();
  });
}

/**
 * Cria uma despesa a partir de uma hospedagem.
 * Se a hospedagem já tem expense_id, atualiza essa despesa.
 * Senão, cria nova e linka.
 *
 * Usa o check-in como expense_date.
 */
export async function syncLodgingExpense(
  supabase: any,
  lodging: Lodging,
  paidByMemberId: string,
  baseCurrency: string,
  exchangeRate: number,
): Promise<{ expenseId: string | null; error: string | null }> {
  if (!lodging.cost_amount || !lodging.cost_currency) {
    return { expenseId: null, error: 'Hospedagem sem valor de custo.' };
  }

  const expenseData = {
    trip_id: lodging.trip_id,
    description: `🏨 ${lodging.name}`,
    amount: lodging.cost_amount,
    currency: lodging.cost_currency,
    amount_in_base: lodging.cost_amount * exchangeRate,
    exchange_rate: exchangeRate,
    paid_by: paidByMemberId,
    category: 'lodging',
    expense_date: lodging.check_in_at
      ? new Date(lodging.check_in_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  };

  if (lodging.expense_id) {
    // Update existente
    const { error } = await supabase
      .from('expenses')
      .update(expenseData)
      .eq('id', lodging.expense_id);
    if (error) return { expenseId: null, error: error.message };
    return { expenseId: lodging.expense_id, error: null };
  }

  // Cria nova
  const { data, error } = await supabase
    .from('expenses')
    .insert(expenseData)
    .select('id')
    .single();

  if (error || !data) return { expenseId: null, error: error?.message ?? 'Erro ao criar despesa' };

  // Linka na hospedagem
  await supabase
    .from('lodgings')
    .update({ expense_id: data.id })
    .eq('id', lodging.id);

  return { expenseId: data.id, error: null };
}

/**
 * Eventos de hospedagem relevantes pra um dia específico do roteiro.
 * - checkIn: hospedagens com check-in nesse dia
 * - checkOut: hospedagens com check-out nesse dia
 * - staying: hospedagens onde o dia cai entre check-in e check-out (excluindo
 *   o próprio dia de check-in/out — pra evitar duplicação)
 */
export type DayLodgingEvents = {
  checkIn: Lodging[];
  checkOut: Lodging[];
  staying: Lodging[];
};

/**
 * Compara duas datas (YYYY-MM-DD) sem considerar timezone/hora.
 * Necessário porque check_in_at é timestamptz mas trip_days.day_date é date.
 */
function isSameDay(iso: string, dayDate: string): boolean {
  // iso: 2026-05-12T15:00:00.000Z → "2026-05-12" (em UTC)
  const isoDate = new Date(iso).toISOString().split('T')[0];
  return isoDate === dayDate;
}

function isBetween(dayDate: string, checkInIso: string, checkOutIso: string): boolean {
  const day = dayDate;
  const inDate = new Date(checkInIso).toISOString().split('T')[0];
  const outDate = new Date(checkOutIso).toISOString().split('T')[0];
  return day > inDate && day < outDate;
}

export function getDayLodgingEvents(
  lodgings: Lodging[],
  dayDate: string,
): DayLodgingEvents {
  const checkIn: Lodging[] = [];
  const checkOut: Lodging[] = [];
  const staying: Lodging[] = [];

  for (const l of lodgings) {
    const hasIn = !!l.check_in_at;
    const hasOut = !!l.check_out_at;

    if (hasIn && isSameDay(l.check_in_at!, dayDate)) {
      checkIn.push(l);
      continue;
    }
    if (hasOut && isSameDay(l.check_out_at!, dayDate)) {
      checkOut.push(l);
      continue;
    }
    if (hasIn && hasOut && isBetween(dayDate, l.check_in_at!, l.check_out_at!)) {
      staying.push(l);
    }
  }

  return { checkIn, checkOut, staying };
}
