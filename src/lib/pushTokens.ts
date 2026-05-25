/**
 * Push tokens — registra o Expo Push Token do device no Supabase
 * pra que outras pessoas possam disparar push pra mim.
 *
 * IMPORTANTE: Push remoto NÃO funciona no Expo Go (a partir do SDK 53).
 * Precisa de um dev build (EAS Build) pra funcionar.
 *
 * Quando rodar em Expo Go, este código não dá erro, só não registra nada.
 * Quando rodar em dev build, captura o token e salva no banco.
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Registra o token Expo Push do device atual no banco.
 * Chama isso DEPOIS de o user ter dado permissão de notificação.
 *
 * Se rodar em Expo Go, retorna null silenciosamente.
 */
export async function registerPushToken(profileId: string): Promise<string | null> {
  // Web não suporta Expo Push (precisaria FCM/Web Push customizado)
  if (Platform.OS === 'web') return null;

  // Não roda no simulador (Device.isDevice false)
  if (!Device.isDevice) return null;

  // Verifica permissão
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    // Pega o Expo Push Token
    // No Expo Go SDK 53+ isso retorna null/erro — é esperado, não é problema
    const tokenResult = await Notifications.getExpoPushTokenAsync();
    const token = tokenResult.data;
    if (!token) return null;

    // Salva no banco (upsert por profile_id + token)
    const { error } = await supabase
      .from('push_tokens' as never) // 'never' porque o tipo ainda não está nos types gerados
      .upsert(
        {
          profile_id: profileId,
          token,
          platform: Platform.OS as 'ios' | 'android',
          device_name: Device.deviceName ?? null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'profile_id,token' }
      );

    if (error) {
      console.warn('Falha ao salvar push token:', error.message);
      return null;
    }

    return token;
  } catch (err) {
    // Esperado em Expo Go — sem panic
    return null;
  }
}

/**
 * Remove o token do device atual do banco.
 * Chamar quando o user faz logout.
 */
export async function unregisterPushToken(profileId: string) {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return;

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync().catch(
      () => null
    );
    if (!tokenResult?.data) return;

    await supabase
      .from('push_tokens' as never)
      .delete()
      .match({ profile_id: profileId, token: tokenResult.data });
  } catch {
    // Silencioso — ok
  }
}
