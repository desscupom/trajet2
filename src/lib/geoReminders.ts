import { supabase } from '@/lib/supabase';

/**
 * Lembretes baseados em localização (geofencing).
 *
 * Como funciona:
 * 1. User cria um geo_reminder com (latitude, longitude, radius_m) + título.
 * 2. App registra geofence usando expo-location/expo-task-manager.
 * 3. Quando OS detecta entrada (ou saída) no raio, callback do task manager
 *    é chamado — INSERT em notifications → push (se webhook ativo).
 * 4. Marca notified_at no geo_reminder (a menos que repeat=true).
 *
 * IMPORTANTE: o matching/trigger acontece NO DEVICE, não no servidor.
 * Por isso o sync de geofences ativas pra OS precisa rodar sempre que
 * a lista muda (criar, deletar, ativar/desativar).
 *
 * Limitações:
 * - iOS limita a 20 geofences simultâneas (sistema). Se passar disso,
 *   os mais antigos são removidos.
 * - Android é mais permissivo mas tem overhead de bateria.
 * - Background tracking requer permissão extra (ACCESS_BACKGROUND_LOCATION).
 */

export type GeoReminder = {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  place_name: string | null;
  trip_id: string | null;
  trigger_on: 'enter' | 'exit';
  notified_at: string | null;
  repeat: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateGeoReminderInput = {
  title: string;
  body?: string;
  latitude: number;
  longitude: number;
  radiusM?: number;
  placeName?: string;
  tripId?: string | null;
  triggerOn?: 'enter' | 'exit';
  repeat?: boolean;
};

export async function listGeoReminders(activeOnly = false): Promise<GeoReminder[]> {
  let query = supabase
    .from('geo_reminders')
    .select('*')
    .order('created_at', { ascending: false });

  if (activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as GeoReminder[];
}

export async function createGeoReminder(
  input: CreateGeoReminderInput,
): Promise<GeoReminder> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('geo_reminders')
    .insert({
      profile_id: userData.user.id,
      title: input.title,
      body: input.body ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      radius_m: input.radiusM ?? 200,
      place_name: input.placeName ?? null,
      trip_id: input.tripId ?? null,
      trigger_on: input.triggerOn ?? 'enter',
      repeat: input.repeat ?? false,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Erro');
  return data as GeoReminder;
}

export async function updateGeoReminder(
  id: string,
  patch: Partial<{
    title: string;
    body: string | null;
    radius_m: number;
    trigger_on: 'enter' | 'exit';
    repeat: boolean;
    active: boolean;
    notified_at: string | null;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('geo_reminders')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGeoReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('geo_reminders')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Marca como notificado (pra single-shot reminders).
 * Após isso, se `repeat=false`, o app vai desregistrar essa geofence do OS.
 */
export async function markGeoReminderNotified(id: string): Promise<void> {
  const { error } = await supabase
    .from('geo_reminders')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Calcula distância em metros entre 2 coordenadas (haversine).
 * Útil pra mostrar no UI "Você está a 3.2 km daqui".
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // raio em metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Formata distância amigável: "150 m", "2.3 km", "45 km".
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
