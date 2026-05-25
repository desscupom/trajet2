/**
 * AIConsentModal — exibido na primeira vez que o usuário tenta usar IA.
 * Exigido pela Apple App Review guideline 5.1.1(i) e 5.1.2(i):
 * o app deve explicar o que é enviado, para quem, e pedir permissão.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const CONSENT_KEY = 'trajet:ai_consent_v1';

export async function hasAIConsent(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(CONSENT_KEY);
    return val === 'granted';
  } catch {
    return false;
  }
}

export async function grantAIConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, 'granted');
}

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function AIConsentModal({ visible, onAccept, onDecline }: Props) {
  const styles = useStyles();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDecline}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Ícone */}
          <Text style={styles.icon}>✨</Text>

          <Text style={styles.title}>Assistente com Inteligência Artificial</Text>

          <Text style={styles.intro}>
            Para gerar roteiros, sugestões de viagem e responder suas perguntas, o Trajet usa
            o serviço de IA da <Text style={styles.bold}>OpenAI</Text>.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>O que é enviado para a IA</Text>
            {[
              'Título e datas da sua viagem',
              'Itens do roteiro (nomes dos lugares)',
              'Resumo das despesas (valores totais)',
              'Sua pergunta ou solicitação',
            ].map((item) => (
              <View key={item} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>O que NÃO é enviado</Text>
            {[
              'Dados pessoais como CPF, RG ou documentos',
              'Fotos ou arquivos',
              'Senhas ou informações de pagamento',
              'Localização GPS em tempo real',
            ].map((item) => (
              <View key={item} style={styles.bullet}>
                <Text style={styles.bulletDot}>✕</Text>
                <Text style={[styles.bulletText, { color: colors.textMuted }]}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Os dados enviados à OpenAI são usados apenas para gerar a resposta solicitada.
              A OpenAI não armazena seus dados para treinamento de modelos por padrão.
              Consulte nossa{' '}
              <Text style={styles.link}>política de privacidade</Text>
              {' '}para mais detalhes.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              title="Aceitar e usar IA"
              onPress={onAccept}
            />
            <Button
              title="Não usar IA agora"
              variant="ghost"
              onPress={onDecline}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Hook para gerenciar o consentimento de IA.
 * Retorna um wrapper que verifica o consentimento antes de executar ações de IA.
 */
export function useAIConsent() {
  const [showConsent, setShowConsent] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  async function requestConsent(action: () => void) {
    const already = await hasAIConsent();
    if (already) {
      action();
      return;
    }
    setPendingAction(() => action);
    setShowConsent(true);
  }

  async function handleAccept() {
    await grantAIConsent();
    setShowConsent(false);
    pendingAction?.();
    setPendingAction(null);
  }

  function handleDecline() {
    setShowConsent(false);
    setPendingAction(null);
  }

  const modal = (
    <AIConsentModal
      visible={showConsent}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  );

  return { requestConsent, consentModal: modal };
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: {
      padding: spacing.xl,
      gap: spacing.lg,
      paddingBottom: 40,
      alignItems: 'center',
    },
    icon: { fontSize: 48, textAlign: 'center' },
    title: {
      fontSize: fontSize.xl,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    intro: {
      fontSize: fontSize.md,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
    },
    bold: { fontWeight: '700', color: colors.text },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      width: '100%',
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    bullet: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    bulletDot: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: fontSize.sm,
      marginTop: 1,
    },
    bulletText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.text,
      lineHeight: 20,
    },
    infoBox: {
      backgroundColor: colors.primarySofter,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      width: '100%',
    },
    infoText: {
      fontSize: fontSize.xs,
      color: colors.textMuted,
      lineHeight: 18,
    },
    link: { color: colors.primary, fontWeight: '600' },
    actions: {
      width: '100%',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
  }), [themeVersion]);
}
