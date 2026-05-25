import { Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/components/ThemeProvider';

import { OfflineBanner } from '@/components/OfflineBanner';
import { useTripActivityNotifications } from '@/hooks/useTripActivityNotifications';
import { colors } from '@/lib/theme';

export default function AppLayout() {
  const styles = useStyles();
  useTripActivityNotifications();

  // Solicita permissão de notificação ao entrar no app
  useEffect(() => {
    async function checkNotificationPermission() {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return;

      if (status === 'undetermined') {
        // Primeira vez — pede permissão diretamente
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert(
            '🔔 Notificações desativadas',
            'Para receber lembretes de viagem e alertas importantes, ative as notificações nas configurações.',
            [
              { text: 'Agora não', style: 'cancel' },
              { text: 'Ativar', onPress: () => Linking.openSettings() },
            ]
          );
        }
      } else if (status === 'denied') {
        // Já foi negado antes — mostra aviso e redireciona para configurações
        Alert.alert(
          '🔔 Notificações desativadas',
          'Você não receberá lembretes de viagem. Ative as notificações nas configurações do iPhone para não perder alertas importantes.',
          [
            { text: 'Ignorar', style: 'cancel' },
            { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
          ]
        );
      }
    }
    checkNotificationPermission();
  }, []);

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Minhas viagens' }} />
        <Stack.Screen name="new-trip" options={{ title: 'Nova viagem', presentation: 'modal' }} />
        <Stack.Screen name="trip-planner" options={{ title: 'Planejar viagem', presentation: 'modal' }} />
        <Stack.Screen name="templates" options={{ title: 'Galeria de roteiros' }} />
        <Stack.Screen name="reminders" options={{ title: 'Lembretes' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notificações' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Configurações' }} />
        <Stack.Screen name="settings/appearance" options={{ title: 'Aparência' }} />
        <Stack.Screen
          name="settings/notifications"
          options={{ title: 'Notificações' }}
        />
        <Stack.Screen
          name="settings/sync"
          options={{ title: 'Sincronização' }}
        />
        <Stack.Screen
          name="settings/safety"
          options={{ title: 'Alertas de segurança' }}
        />
        <Stack.Screen name="trip/[id]/index" options={{ title: '' }} />
        <Stack.Screen
          name="trip/[id]/edit"
          options={{ title: 'Editar viagem', presentation: 'modal' }}
        />
        <Stack.Screen
          name="trip/[id]/day/[dayId]"
          options={{ title: 'Dia' }}
        />
        <Stack.Screen
          name="trip/[id]/lodging/[lodgingId]"
          options={{ title: 'Hospedagem' }}
        />
        <Stack.Screen
          name="trip/[id]/savings-plan"
          options={{ title: 'Plano de poupança', presentation: 'modal' }}
        />
      </Stack>

      {/* Banner offline flutua sobre todo o conteúdo */}
      <SafeAreaView style={styles.bannerWrap} edges={['bottom']} pointerEvents="box-none">
        <OfflineBanner />
      </SafeAreaView>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  root: { flex: 1 },
  bannerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
}), [themeVersion]);
}
