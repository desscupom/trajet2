import { useLocalSearchParams, useRouter } from 'expo-router';
import {useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { formatDateRangeBR } from '@/lib/dates';
import {
  acceptInvite,
  describeInviteError,
  fetchInvitePreview,
  type InvitePreview,
} from '@/lib/invites';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export default function InviteScreen() {
  const styles = useStyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega o preview assim que o token chega e o auth resolve
  useEffect(() => {
    if (authLoading || !token) return;
    if (!session) {
      // Não autenticado: redireciona pro login mantendo o token na URL
      // Após login, o usuário cai aqui de novo (já com sessão).
      router.replace({
        pathname: '/(auth)/sign-in',
        params: { invite: token as string },
      });
      return;
    }

    let mounted = true;
    fetchInvitePreview(token as string).then((data) => {
      if (!mounted) return;
      setPreview(data);
      setLoadingPreview(false);
    });
    return () => {
      mounted = false;
    };
  }, [token, session, authLoading, router]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    const result = await acceptInvite(token as string);
    setAccepting(false);

    if (!result.success) {
      setError(describeInviteError(result.reason));
      return;
    }

    // Sucesso. Vai pra viagem.
    if (result.tripId) {
      router.replace(`/(app)/trip/${result.tripId}`);
    } else {
      router.replace('/(app)');
    }
  }

  if (authLoading || loadingPreview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!preview || !preview.is_valid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorIcon}>🔗</Text>
          <Text style={styles.errorTitle}>Convite inválido</Text>
          <Text style={styles.errorText}>
            {describeInviteError(preview?.reason ?? null)}
          </Text>
          <Button
            title="Ir para minhas viagens"
            onPress={() => router.replace('/(app)')}
            style={styles.errorBtn}
          />
        </View>
      </SafeAreaView>
    );
  }

  const dateRange = formatDateRangeBR(preview.start_date, preview.end_date);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.invitedBy}>
          <Text style={styles.invitedByText}>
            <Text style={styles.invitedByName}>
              {preview.inviter_name ?? 'Alguém'}
            </Text>{' '}
            te convidou para
          </Text>
        </View>

        <View style={styles.tripCard}>
          <Text style={styles.tripTitle}>{preview.trip_title}</Text>
          {!!dateRange && <Text style={styles.tripDates}>{dateRange}</Text>}
          {preview.trip_description && (
            <Text style={styles.tripDescription}>
              {preview.trip_description}
            </Text>
          )}
        </View>

        <Text style={styles.roleNote}>
          Você entrará como{' '}
          <Text style={styles.roleNoteStrong}>
            {preview.role === 'editor' ? 'editor' : 'visualizador'}
          </Text>
          {preview.role === 'editor'
            ? ', podendo planejar junto.'
            : ', podendo ver tudo mas não editar.'}
        </Text>

        {error && <Text style={styles.errorMessage}>{error}</Text>}

        <View style={styles.actions}>
          <Button
            title="Aceitar e entrar"
            onPress={handleAccept}
            loading={accepting}
          />
          <Button
            title="Cancelar"
            variant="ghost"
            onPress={() => router.replace('/(app)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  invitedBy: { alignItems: 'center' },
  invitedByText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  invitedByName: { color: colors.text, fontWeight: '600' },
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  tripTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  tripDates: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  tripDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  roleNote: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  roleNoteStrong: { color: colors.text, fontWeight: '600' },
  errorMessage: {
    color: colors.danger,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  actions: { gap: spacing.sm },
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorIcon: { fontSize: 48 },
  errorTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBtn: { marginTop: spacing.lg, alignSelf: 'stretch' },
}), [themeVersion]);
}
