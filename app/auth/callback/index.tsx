/**
 * Rota de callback do OAuth (Google / Apple).
 *
 * Quando o browser externo redireciona para `trajet://auth/callback?...`,
 * o Expo Router monta esta tela. Ela extrai os tokens da URL,
 * chama supabase.auth.setSession e navega pro app.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fontSize, spacing } from '@/lib/theme';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      // Expo Router já parseia a query string para params
      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;
        // Navega para home após login bem-sucedido
        router.replace('/(app)');
        return;
      }

      // Fallback: tenta pegar sessão atual (o Supabase pode ter processado automaticamente)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/(app)');
        return;
      }

      setError('Não foi possível completar o login. Tente novamente.');
    } catch (err: any) {
      setError(err?.message ?? 'Erro desconhecido ao fazer login.');
    }
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorText}>{error}</Text>
        <Text
          style={s.retry}
          onPress={() => router.replace('/(auth)/sign-in')}
        >
          Voltar ao login
        </Text>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={s.loadingText}>Finalizando login...</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  errorIcon: { fontSize: 40 },
  errorText: {
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  retry: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
