import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { createLocalNotification } from '@/lib/notificationsInApp';
import {
  listGeoReminders,
  markGeoReminderNotified,
  type GeoReminder,
} from '@/lib/geoReminders';

/**
 * Background task handler pra geofencing.
 *
 * Como funciona:
 * 1. Definimos uma task com `TaskManager.defineTask` (uma vez, on import)
 * 2. App chama `Location.startGeofencingAsync(TASK_NAME, regions[])`
 *    pra registrar regiões a serem monitoradas
 * 3. Quando OS detecta entry/exit, chama o handler — mesmo com app fechado
 * 4. Handler busca o geo_reminder correspondente, cria notification, marca como notificado
 *
 * Limitações importantes:
 * - O handler **roda em isolation** — não tem acesso a Context/Auth do app principal
 * - Por isso usamos o cliente Supabase que já tem sessão persistida em AsyncStorage
 * - iOS: máx 20 regiões. Se passar, descarta as mais antigas
 * - Permissão de background é necessária (já configurada em app.json)
 */

export const GEOFENCING_TASK = 'trajet-geofencing-v1';

type GeofencingPayload = {
  eventType: Location.GeofencingEventType; // 1 = Enter, 2 = Exit
  region: Location.LocationRegion;
};

// Define a task — esse código roda em runtime separado quando o OS dispara o evento.
// Precisa ser chamado no top-level (não dentro de componente) — antes do app inicializar.
TaskManager.defineTask<GeofencingPayload>(GEOFENCING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[geofencing] task error:', error);
    return;
  }
  if (!data) return;

  const { eventType, region } = data;
  const isEnter = eventType === Location.GeofencingEventType.Enter;
  const isExit = eventType === Location.GeofencingEventType.Exit;

  if (!isEnter && !isExit) return;

  // O `region.identifier` que setamos é o geo_reminder.id
  const reminderId = region.identifier;
  if (!reminderId) return;

  try {
    // Carrega o reminder do banco (precisa estar logado — usa sessão persistida)
    const reminders = await listGeoReminders(true);
    const reminder = reminders.find((r) => r.id === reminderId);

    if (!reminder) {
      return;
    }

    // Filtra pelo trigger_on
    const triggerType: 'enter' | 'exit' = isEnter ? 'enter' : 'exit';
    if (reminder.trigger_on !== triggerType) return;

    // Já foi notificado e não é repeat? Skip.
    if (reminder.notified_at && !reminder.repeat) return;

    // Cria notif (vai virar push automático via webhook)
    await createLocalNotification({
      type: 'other',
      title: reminder.title,
      body: reminder.body ?? undefined,
      data: {
        geo_reminder_id: reminder.id,
        trip_id: reminder.trip_id ?? undefined,
        event: triggerType,
        place_name: reminder.place_name ?? undefined,
      },
    });

    // Marca como notificado (se não é repeat)
    if (!reminder.repeat) {
      await markGeoReminderNotified(reminder.id);
    }
  } catch (err) {
    console.error('[geofencing] erro processando evento:', err);
  }
});

/**
 * Sincroniza a lista de geofences ativas no OS com o que está no banco.
 *
 * Chame esta função:
 * - Após login
 * - Após criar/editar/deletar um geo_reminder
 * - Após ativar/desativar um reminder
 *
 * iOS limita a 20 geofences. Se tiver mais, priorizamos os criados mais recentemente
 * (mais provável de ser relevante).
 */
export async function syncGeofencesWithOS(): Promise<void> {
  try {
    // Verifica permissão
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      return;
    }
    // Background location removida — geofencing só funciona em foreground
    // Não chama getBackgroundPermissionsAsync (causa crash no Android 12+ sem a permissão declarada)

    // Para qualquer geofencing rodando
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK).catch(() => {});
    }

    // Busca reminders ativos não-notificados (ou repeat)
    const all = await listGeoReminders(true);
    const eligible = all.filter((r) => !r.notified_at || r.repeat);

    if (eligible.length === 0) {
      return;
    }

    // Limita a 20 (limite iOS) — prioriza mais recentes
    const limited = eligible
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20);

    const regions: Location.LocationRegion[] = limited.map(reminderToRegion);

    await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
  } catch (err) {
    console.error('[geofencing] erro syncing:', err);
  }
}

function reminderToRegion(r: GeoReminder): Location.LocationRegion {
  return {
    identifier: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    radius: r.radius_m,
    // O OS notifica ambos enter/exit, filtramos no handler
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

/**
 * Pede permissões de localização (foreground + background).
 * Retorna true se ambas foram concedidas.
 *
 * IMPORTANTE: pedir foreground PRIMEIRO. Background sem foreground = erro em iOS.
 * Background no Android exige UX especial (segundo prompt explicando).
 */
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { foreground: false, background: false };
  }

  // Background location foi removido para maior compatibilidade com o Google Play.
  // Lembretes geo funcionam em foreground — app em primeiro plano ou notificação ativa.
  return {
    foreground: true,
    background: false,
  };
}

/**
 * Para todo o geofencing (uso: logout).
 */
export async function stopGeofencing(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK);
    }
  } catch (err) {
    console.warn('[geofencing] erro parando:', err);
  }
}
