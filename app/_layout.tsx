import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, LogBox, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

LogBox.ignoreLogs([
  'Network request failed',
  'expo-notifications',
  'expo-notifications functionality is not fully supported',
  'Android Push notifications',
  'AuthRetryableFetchError',
  'FetchError',
  'geofencing',
  'TaskManager',
]);

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { GlobalWebStyles } from '@/components/GlobalWebStyles';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/hooks/useAuth';
import { configureNotifications } from '@/lib/notifications';
import { registerPushToken } from '@/lib/pushTokens';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// NÃO importa geofencingTask no topo — causa crash no Android sem background location.
// Carrega lazy apenas quando necessário.

// Configura handler de notificações — seguro, sem módulos nativos problemáticos
configureNotifications();

async function handleDeepLink(url: string) {
  if (!url) return;
  try {
    const parsed = new URL(url.replace('trajet://', 'https://trajet.app/'));
    const accessToken = parsed.searchParams.get('access_token');
    const refreshToken = parsed.searchParams.get('refresh_token');
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  } catch {}
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <GlobalWebStyles />
            <ThemedStatusBar />
            <AuthGate />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const { effective } = useTheme();
  return <StatusBar style={effective === 'light' ? 'dark' : 'light'} />;
}

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const sub = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isPublicRoute = segments[0] === 'invite' || segments[0] === 'p';
    if (isPublicRoute) return;
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, loading, segments, router]);

  useEffect(() => {
    if (!session?.user?.id) return;
    // Push token — silencioso em Expo Go
    registerPushToken(session.user.id).catch(() => {});
  }, [session?.user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="invite/[token]" />
        <Stack.Screen name="p/[id]" />
      </Stack>
    </ErrorBoundary>
  );
}
