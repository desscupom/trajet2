import { supabase } from '@/lib/supabase';

export async function duplicateTrip(tripId: string, userId: string): Promise<string | null> {
  const [tripRes, daysRes, itemsRes, lodgingsRes, tasksRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('trip_days').select('*').eq('trip_id', tripId).order('position'),
    supabase.from('itinerary_items').select(
      'id, trip_day_id, place_id, custom_title, start_time, duration_minutes, notes, position'
    ),
    supabase.from('lodgings').select('*').eq('trip_id', tripId),
    supabase.from('tasks').select('*').eq('trip_id', tripId),
  ]);

  if (tripRes.error || !tripRes.data) return null;
  const orig = tripRes.data;
  const days = daysRes.data ?? [];
  const dayIds = new Set(days.map((d) => d.id));
  const tripItems = (itemsRes.data ?? []).filter((it) => dayIds.has(it.trip_day_id));

  const { data: newTrip, error: tripError } = await supabase
    .from('trips')
    .insert({
      owner_id: userId,
      title: `${orig.title} (cópia)`,
      description: orig.description,
      base_currency: orig.base_currency,
      cover_image_url: orig.cover_image_url,
      start_date: null,
      end_date: null,
      feature_itinerary: orig.feature_itinerary,
      feature_lodging: orig.feature_lodging,
      feature_places: orig.feature_places,
      feature_expenses: orig.feature_expenses,
      feature_tasks: orig.feature_tasks,
    })
    .select()
    .single();

  if (tripError || !newTrip) return null;
  const newTripId = newTrip.id;
  const dayIdMap: Record<string, string> = {};

  if (days.length > 0) {
    const { data: insertedDays } = await supabase
      .from('trip_days')
      .insert(days.map((d) => ({ trip_id: newTripId, day_date: d.day_date, position: d.position, notes: d.notes })))
      .select('id');
    if (insertedDays) days.forEach((d, i) => { dayIdMap[d.id] = insertedDays[i]?.id; });
  }

  const validItems = tripItems.filter((it) => dayIdMap[it.trip_day_id]);
  if (validItems.length > 0) {
    await supabase.from('itinerary_items').insert(
      validItems.map((it) => ({
        trip_day_id: dayIdMap[it.trip_day_id],
        place_id: it.place_id,
        custom_title: it.custom_title,
        start_time: it.start_time,
        duration_minutes: it.duration_minutes,
        notes: it.notes,
        position: it.position,
      })),
    );
  }

  const lodgings = lodgingsRes.data ?? [];
  if (lodgings.length > 0) {
    await supabase.from('lodgings').insert(
      lodgings.map((l) => ({ trip_id: newTripId, kind: l.kind, name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, notes: l.notes })),
    );
  }

  const tasks = tasksRes.data ?? [];
  if (tasks.length > 0) {
    await supabase.from('tasks').insert(
      tasks.map((t) => ({ trip_id: newTripId, title: t.title, done: false, due_date: null })),
    );
  }

  return newTripId;
}
