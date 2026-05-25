import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { FloatingInput } from '@/components/FloatingInput';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

// Necessário para fechar o browser após OAuth no iOS
WebBrowser.maybeCompleteAuthSession();

// Redirect URI fixo — deve estar configurado no Supabase Dashboard
const REDIRECT_URI = 'trajet://auth/callback';

// ─── Google icon ─────────────────────────────────────────────
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </Svg>
  );
}

// ─── Apple icon ──────────────────────────────────────────────
function AppleIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 170 209" fill={color}>
      <Path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.017.17 2.033.17 3.241z"/>
    </Svg>
  );
}

export default function SignInScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  // Escuta deep links de retorno do OAuth
  useEffect(() => {
    async function handleUrl(url: string) {
      if (!url.includes('auth/callback') && !url.includes('access_token') && !url.includes('refresh_token')) return;
      try {
        let normalized = url;
        // Converte hash para query params se necessário
        if (normalized.includes('#')) {
          normalized = normalized.replace('#', '?');
        }
        // Normaliza o scheme para poder usar URL parser
        const forParsing = normalized
          .replace('trajet://auth/callback', 'https://trajet.app/callback')
          .replace('trajet://', 'https://trajet.app/');

        const parsed = new URL(forParsing);
        const accessToken = parsed.searchParams.get('access_token');
        const refreshToken = parsed.searchParams.get('refresh_token');
        const errorDesc = parsed.searchParams.get('error_description');

        if (errorDesc) {
          toast.error(decodeURIComponent(errorDesc));
          setOauthLoading(null);
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) toast.error(error.message);
        } else {
          // Fluxo PKCE — sessão já está no storage
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            // Tenta exchangeCodeForSession
            const code = parsed.searchParams.get('code');
            if (code) {
              await supabase.auth.exchangeCodeForSession(normalized);
            }
          }
        }
      } catch (err) {
        console.warn('OAuth callback error:', err);
      } finally {
        setOauthLoading(null);
      }
    }

    // URL inicial (app aberto via deep link)
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });

    // URLs enquanto o app está aberto
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  async function handleSignIn() {
    if (!email || !password) { toast.error('Preencha email e senha.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (invite) router.replace(`/invite/${invite}` as any);
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    if (provider === 'apple') {
      await handleAppleSignIn();
      return;
    }
    setOauthLoading(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: REDIRECT_URI,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('URL não gerada.');

      if (Platform.OS === 'android') {
        await WebBrowser.openBrowserAsync(data.url, {
          showTitle: false,
          enableBarCollapsing: true,
          showInRecents: false,
        });
      } else {
        // iOS: openAuthSessionAsync intercepta o redirect e retorna a URL
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          REDIRECT_URI,
          { preferEphemeralSession: false }
        );
        if (result.type === 'success' && result.url) {
          // Processa o token diretamente do resultado
          let url = result.url;
          if (url.includes('#')) url = url.replace('#', '?');
          const forParsing = url
            .replace('trajet://auth/callback', 'https://trajet.app/callback')
            .replace('trajet://', 'https://trajet.app/');
          try {
            const parsed = new URL(forParsing);
            const at = parsed.searchParams.get('access_token');
            const rt = parsed.searchParams.get('refresh_token');
            if (at && rt) {
              await supabase.auth.setSession({ access_token: at, refresh_token: rt });
            } else {
              const code = parsed.searchParams.get('code');
              if (code) await supabase.auth.exchangeCodeForSession(url);
              else await supabase.auth.getSession();
            }
          } catch { await supabase.auth.getSession(); }
        } else if (result.type === 'cancel' || result.type === 'dismiss') {
          setOauthLoading(null);
        }
      }
    } catch (err: any) {
      setOauthLoading(null);
      toast.error(err?.message ?? 'Erro ao iniciar login. Tente novamente.');
    }
  }

  async function handleAppleSignIn() {
    setOauthLoading('apple');
    try {
      // Gera nonce aleatório
      const rawNonce = Math.random().toString(36).substring(2, 18);
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Token Apple não recebido.');
      }

      // Passa o token SEM nonce — o Supabase gerencia internamente
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      toast.error(err?.message ?? 'Erro ao entrar com Apple. Tente novamente.');
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.header}>
              <Image
                source={require('@/../assets/logo-full.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.subtitle}>
                Suas viagens, do planejamento à última foto.
              </Text>
            </View>

            {/* OAuth */}
            <View style={styles.oauthRow}>
              <Pressable
                onPress={() => handleOAuth('google')}
                style={[styles.oauthBtn, oauthLoading === 'google' && styles.oauthLoading]}
                disabled={!!oauthLoading}
              >
                <GoogleIcon size={19} />
                <Text style={styles.oauthText}>
                  {oauthLoading === 'google' ? 'Abrindo...' : 'Entrar com Google'}
                </Text>
              </Pressable>

              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.lg}
                  style={{ width: '100%', height: 50 }}
                  onPress={() => handleAppleSignIn()}
                />
              )}
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou use seu email</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.form}>
              <FloatingInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="voce@exemplo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
              <FloatingInput
                label="Senha"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <Button title="Entrar" onPress={handleSignIn} loading={loading} />
              <View style={styles.footer}>
                <Text style={styles.footerText}>Ainda não tem conta?</Text>
                <Button
                  title="Criar conta"
                  variant="ghost"
                  onPress={() =>
                    router.push(
                      invite
                        ? { pathname: '/(auth)/sign-up', params: { invite } }
                        : '/(auth)/sign-up'
                    )
                  }
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.bg },
        flex: { flex: 1 },
        scroll: {
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.xxxl,
        },
        header: { alignItems: 'center', marginBottom: spacing.xl },
        logoImage: { width: 200, height: 80, marginBottom: spacing.md },
        subtitle: {
          color: colors.textMuted,
          fontSize: fontSize.md,
          textAlign: 'center',
          paddingHorizontal: spacing.lg,
        },
        oauthRow: { gap: spacing.sm, marginBottom: spacing.lg },
        oauthBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 13,
        },
        oauthBtnApple: { backgroundColor: '#000', borderColor: '#1a1a1a' },
        oauthLoading: { opacity: 0.55 },
        oauthText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
        dividerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.lg,
        },
        dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
        dividerText: { color: colors.textMuted, fontSize: fontSize.xs },
        form: { gap: spacing.md },
        footer: { alignItems: 'center', marginTop: spacing.md },
        footerText: { color: colors.textMuted, fontSize: fontSize.sm },
      }),
    [themeVersion]
  );
}
