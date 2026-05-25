import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Configurações globais — chamadas uma vez no app boot.
 * Define como notificações se comportam quando recebidas com app aberto.
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // Tipos novos do SDK 53+
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Pede permissão pra mostrar notificações.
 * Retorna `true` se concedida.
 *
 * No iOS sem dev build, isso pode não funcionar perfeitamente — mas
 * `requestPermissionsAsync` em si funciona pra notificações locais.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // web não tem expo-notifications

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return status === 'granted';
}

/**
 * Agenda uma notificação local pra uma data específica no futuro.
 * Se a data já passou, retorna sem fazer nada.
 *
 * Retorna o `identifier` da notificação (use pra cancelar depois).
 */
export async function scheduleLocalNotification({
  title,
  body,
  triggerAt,
  data,
}: {
  title: string;
  body: string;
  triggerAt: Date;
  data?: Record<string, unknown>;
}): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (triggerAt.getTime() <= Date.now()) return null; // data já passou

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {} },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
      },
    });
    return id;
  } catch (err) {
    console.warn('Erro ao agendar notificação:', err);
    return null;
  }
}

/** Cancela uma notificação agendada pelo seu identifier. */
export async function cancelScheduledNotification(identifier: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // ignora — talvez já tenha disparado ou foi cancelada
  }
}

/** Cancela todas as notificações agendadas pelo app. */
export async function cancelAllScheduledNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Lista todas as notificações ainda agendadas (debug).
 */
export async function listScheduled(): Promise<Notifications.NotificationRequest[]> {
  if (Platform.OS === 'web') return [];
  return Notifications.getAllScheduledNotificationsAsync();
}
