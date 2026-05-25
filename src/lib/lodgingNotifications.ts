import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  cancelScheduledNotification,
  scheduleLocalNotification,
} from '@/lib/notifications';

const STORAGE_KEY = 'trajet:lodging_notifications';

/**
 * Mapeamento lodgingId -> notificationId pra conseguir cancelar/atualizar
 * sem perder rastro do agendamento prévio.
 */
type Mapping = Record<string, string>;

async function readMapping(): Promise<Mapping> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeMapping(map: Mapping): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * Agenda lembrete de check-in pra uma hospedagem.
 *
 * Se já existir agendamento pra essa hospedagem, cancela o antigo primeiro
 * (idempotente — pode ser chamado várias vezes pelo realtime/sync sem duplicar).
 *
 * @param checkInIso check_in_at em ISO (timestamptz do banco)
 * @param offsetMinutes quantos minutos ANTES do check-in disparar
 *                     (default 120 = 2 horas antes)
 */
export async function scheduleLodgingCheckInReminder(
  lodgingId: string,
  lodgingName: string,
  checkInIso: string,
  offsetMinutes: number = 120
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancela qualquer agendamento anterior dessa hospedagem
  await cancelLodgingCheckInReminder(lodgingId);

  const checkInDate = new Date(checkInIso);
  const triggerAt = new Date(checkInDate.getTime() - offsetMinutes * 60 * 1000);

  // Não agenda no passado (hospedagem que já começou)
  if (triggerAt.getTime() <= Date.now()) return;

  // Mensagem amigável: "Check-in daqui a 2h" ou "Check-in em 30min"
  const minutesAhead = Math.round(offsetMinutes);
  const aheadLabel =
    minutesAhead >= 60
      ? `${Math.round(minutesAhead / 60)}h`
      : `${minutesAhead}min`;

  const notifId = await scheduleLocalNotification({
    title: `Check-in em ${aheadLabel}`,
    body: lodgingName,
    triggerAt,
    data: { type: 'lodging_checkin', lodgingId },
  });

  if (notifId) {
    const map = await readMapping();
    map[lodgingId] = notifId;
    await writeMapping(map);
  }
}

/** Cancela o lembrete agendado pra uma hospedagem, se houver. */
export async function cancelLodgingCheckInReminder(
  lodgingId: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  const map = await readMapping();
  const notifId = map[lodgingId];
  if (notifId) {
    await cancelScheduledNotification(notifId);
    delete map[lodgingId];
    await writeMapping(map);
  }
}
