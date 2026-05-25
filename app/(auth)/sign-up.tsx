import { useLocalSearchParams, useRouter } from 'expo-router';
import {useState, useMemo } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { FloatingInput } from '@/components/FloatingInput';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { useToast } from '@/components/Toast';
import { validatePassword } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, spacing } from '@/lib/theme';

export default function SignUpScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !fullName) {
      toast.error('Preencha todos os campos.');
      return;
    }
    const { ok, error: pwdError } = validatePassword(password);
    if (!ok) {
      toast.error(pwdError!);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Conta criada! Faça login para começar.');
    router.replace(
      invite
        ? { pathname: '/(auth)/sign-in', params: { invite } }
        : '/(auth)/sign-in'
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Image
              source={require('@/../assets/logo-full.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>
              Comece a planejar suas viagens.
            </Text>
          </View>

          <View style={styles.form}>
            <FloatingInput
              label="Nome"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Como você quer ser chamado"
              autoCapitalize="words"
            />
            <FloatingInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@exemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <FloatingInput
              label="Senha"
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              secureTextEntry
              autoComplete="password-new"
            />
            {password.length > 0 && (
              <PasswordStrengthMeter password={password} />
            )}

            <Button title="Criar conta" onPress={handleSignUp} loading={loading} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Já tem conta?</Text>
              <Button
                title="Entrar"
                variant="ghost"
                onPress={() =>
                  router.push(
                    invite
                      ? { pathname: '/(auth)/sign-in', params: { invite } }
                      : '/(auth)/sign-in'
                  )
                }
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 160,
    height: 60,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
}), [themeVersion]);
}
