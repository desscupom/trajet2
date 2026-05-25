import { supabase, type Trip } from '@/lib/supabase';
import {
  generateAndShareTripPDF,
  type ExpenseSummary,
  type TaskSummary,
  type TripPDFData,
} from '@/lib/pdfExport';
import type { ItineraryItem, TripDay } from '@/components/trip/types';
import type { Lodging } from '@/lib/lodgings';

/**
 * Carrega TODOS os dados necessários da viagem e gera o PDF.
 *
 * Faz N queries em paralelo:
 * - trip_days
 * - itinerary_items (com place)
 * - lodgings (se feature ativa)
 * - expenses + expense_shares (se feature ativa)
 * - tasks (se feature ativa)
 * - trip_members + profiles (pra mapear "paid_by" → nome)
 *
 * Tempo total esperado: 1-2s (queries) + 1-3s (PDF) + 0s (share dialog).
 */
export async function exportTripAsPDF(trip: Trip): Promise<void> {
  // Pega tudo em paralelo
  const [
    daysResult,
    itemsResult,
    lodgingsResult,
    expensesResult,
    tasksResult,
    membersResult,
  ] = await Promise.all([
    supabase
      .from('trip_days')
      .select('id, day_date, position, notes')
      .eq('trip_id', trip.id)
      .order('day_date'),

    supabase
      .from('itinerary_items')
      .select(
        'id, trip_day_id, custom_title, start_time, duration_minutes, notes, position, place:places(id, name, address, category, latitude, longitude)',
      ),

    trip.feature_lodging !== false
      ? supabase.from('lodgings').select('*').eq('trip_id', trip.id)
      : Promise.resolve({ data: [], error: null }),

    trip.feature_expenses !== false
      ? supabase
          .from('expenses')
          .select(
            'id, description, amount, currency, amount_in_base, expense_date, category, paid_by',
          )
          .eq('trip_id', trip.id)
      : Promise.resolve({ data: [], error: null }),

    trip.feature_tasks !== false
      ? supabase
          .from('tasks')
          .select('id, title, done, due_date')
          .eq('trip_id', trip.id)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from('trip_members')
      .select('profile_id, profile:profiles(id, full_name, email)')
      .eq('trip_id', trip.id),
  ]);

  // Monta o payload tipado
  const days = (daysResult.data ?? []) as TripDay[];
  const itineraryItems = (itemsResult.data ?? []) as unknown as ItineraryItem[];
  const lodgings = (lodgingsResult.data ?? []) as Lodging[];
  const expenses = (expensesResult.data ?? []) as ExpenseSummary[];
  const tasks = (tasksResult.data ?? []) as TaskSummary[];

  // Members: extrai profile_id + nome
  const rawMembers = (membersResult.data ?? []) as Array<{
    profile_id: string;
    profile: { full_name: string | null; email: string } | null;
  }>;
  const members = rawMembers
    .filter((m) => m.profile !== null)
    .map((m) => ({
      profile_id: m.profile_id,
      full_name: m.profile!.full_name,
      email: m.profile!.email,
    }));

  const data: TripPDFData = {
    trip,
    days,
    itineraryItems,
    lodgings,
    expenses,
    tasks,
    members,
  };

  await generateAndShareTripPDF(data);
}
