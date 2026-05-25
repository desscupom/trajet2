import * as Clipboard from 'expo-clipboard';
import {useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share as RNShare,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { Copy, Link as LinkIcon, Trash2, X } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { formatDateBR } from '@/lib/dates';
import {
  buildPublicURL,
  createShare,
  getShareStatus,
  listShares,
  revokeShare,
  type PublicTripShare,
} from '@/lib/publicShare';
import type { Trip } from '@/lib/supabase';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Props = {
  trip: Trip;
  visible: boolean;
  onClose: () => void;
};

/**
 * Modal pra gerenciar links públicos de compartilhamento da viagem.
 *
 * Fluxo:
 * 1. Lista links existentes (ativos + revogados/expirados)
 * 2. Botão "Gerar novo link" abre form: incluir hospedagens? despesas? tarefas? expira em quantos dias?
 * 3. Cria link → mostra na lista
 * 4. Pra cada link: botão Copiar, Compartilhar (share sheet nativo), Revogar
 */
export function ShareTripModal({ trip, visible, onClose }: Props) {
  const styles = useStyles();
  const toast = useToast();

  const [shares, setShares] = useState<PublicTripShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Settings pra novo link
  const [includeLodgings, setIncludeLodgings] = useState(true);
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      fetchShares();
      setIncludeLodgings(true);
      setIncludeExpenses(false);
      setIncludeTasks(false);
      setExpiresInDays(null);
    }
  }, [visible]);

  async function fetchShares() {
    setLoading(true);
    try {
      const list = await listShares(trip.id);
      setShares(list);
    } catch (err: any) {
      console.warn('Erro listando shares:', err);
      toast.error('Erro ao carregar links.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const newShare = await createShare(trip.id, {
        includeLodgings,
        includeExpenses,
        includeTasks,
        expiresInDays,
      });
      setShares([newShare, ...shares]);
      toast.success('Link gerado.');

      // Copia automaticamente pro clipboard
      const url = buildPublicURL(newShare.token);
      await Clipboard.setStringAsync(url);
    } catch (err: any) {
      console.warn('Erro criando share:', err);
      toast.error(err?.message ?? 'Erro ao gerar link.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(share: PublicTripShare) {
    const url = buildPublicURL(share.token);
    await Clipboard.setStringAsync(url);
    toast.success('Link copiado.');
  }

  /**
   * Compartilha o link via share sheet nativo (WhatsApp, Mail, AirDrop, etc).
   * Usa React Native `Share` API — não confundir com `expo-sharing` que é
   * pra compartilhar arquivos.
   */
  async function handleShare(share: PublicTripShare) {
    const url = buildPublicURL(share.token);
    const message = `Confere o roteiro da viagem "${trip.title}":\n${url}`;
    try {
      await RNShare.share({
        message,
        url, // iOS usa isso preferencialmente
        title: trip.title,
      });
    } catch (err: any) {
      // User cancelou ou erro — não mostra toast
    }
  }

  function handleRevoke(share: PublicTripShare) {
    Alert.alert(
      'Revogar link?',
      'Quem já tem o link não vai mais conseguir acessar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeShare(share.id);
              await fetchShares();
              toast.success('Link revogado.');
            } catch (err: any) {
              toast.error(err?.message ?? 'Erro ao revogar.');
            }
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Compartilhar viagem</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.intro}>
              <View style={styles.iconWrap}>
                <LinkIcon size={24} color={colors.primary} />
              </View>
              <Text style={styles.introHint}>
                Gere um link público read-only pra dividir o roteiro com
                amigos e família — eles não precisam ter conta no Trajet.
              </Text>
            </View>

            {/* ----- Novo link ----- */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Novo link</Text>
              <Text style={styles.sectionHint}>
                Escolha o que mostrar. Você pode revogar a qualquer momento.
              </Text>

              <ToggleRow
                label="Incluir hospedagens"
                value={includeLodgings}
                onChange={setIncludeLodgings}
              />
              <ToggleRow
                label="Incluir despesas"
                value={includeExpenses}
                onChange={setIncludeExpenses}
              />
              <ToggleRow
                label="Incluir tarefas"
                value={includeTasks}
                onChange={setIncludeTasks}
              />

              <View style={styles.expirySection}>
                <Text style={styles.expiryLabel}>Expira em</Text>
                <View style={styles.expiryRow}>
                  {[
                    { value: null, label: 'Sem expiração' },
                    { value: 7, label: '7 dias' },
                    { value: 30, label: '30 dias' },
                    { value: 90, label: '90 dias' },
                  ].map((opt) => (
                    <Pressable
                      key={opt.label}
                      onPress={() => setExpiresInDays(opt.value)}
                      style={[
                        styles.expiryBtn,
                        expiresInDays === opt.value && styles.expiryBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.expiryBtnText,
                          expiresInDays === opt.value && styles.expiryBtnTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Button
                title="Gerar link"
                variant="primary"
                onPress={handleCreate}
                loading={creating}
                leftIcon={<LinkIcon size={14} color={colors.bg} />}
              />
            </View>

            {/* ----- Links existentes ----- */}
            <Text style={styles.sectionLabel}>Links ativos</Text>

            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : shares.length === 0 ? (
              <Text style={styles.emptyText}>
                Nenhum link gerado ainda.
              </Text>
            ) : (
              shares.map((s) => (
                <ShareCard
                  key={s.id}
                  share={s}
                  onCopy={() => handleCopy(s)}
                  onShare={() => handleShare(s)}
                  onRevoke={() => handleRevoke(s)}
                />
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

function ShareCard({
  share,
  onCopy,
  onShare,
  onRevoke,
}: {
  share: PublicTripShare;
  onCopy: () => void;
  onShare: () => void;
  onRevoke: () => void;
}) {
  const styles = useStyles();
  const status = getShareStatus(share);
  const url = buildPublicURL(share.token);
  // Mostra só os últimos 8 chars do token (privacy + compactness)
  const tokenSuffix = '…' + share.token.slice(-8);

  const statusLabel =
    status === 'active'
      ? 'Ativo'
      : status === 'expired'
        ? 'Expirado'
        : 'Revogado';
  const statusColor =
    status === 'active'
      ? colors.success ?? '#22c55e'
      : colors.textMuted;

  return (
    <View
      style={[
        styles.shareCard,
        status !== 'active' && styles.shareCardInactive,
      ]}
    >
      <View style={styles.shareCardHeader}>
        <Text style={styles.shareToken}>{tokenSuffix}</Text>
        <View
          style={[
            styles.statusChip,
            { backgroundColor: statusColor + '22' },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.shareUrl} numberOfLines={2}>
        {url}
      </Text>

      <View style={styles.shareMeta}>
        <Text style={styles.shareMetaText}>
          Criado em {formatDateBR((share.created_at ?? '').split('T')[0])}
        </Text>
        {share.expires_at && (
          <Text style={styles.shareMetaText}>
            · Expira em {formatDateBR((share.expires_at ?? '').split('T')[0])}
          </Text>
        )}
        <Text style={styles.shareMetaText}>· {share.views} visualizações</Text>
      </View>

      {status === 'active' && (
        <View style={styles.shareActions}>
          <Button
            title="Copiar"
            variant="ghost"
            size="sm"
            leftIcon={<Copy size={14} color={colors.text} />}
            onPress={onCopy}
            style={{ flex: 1 }}
          />
          <Button
            title="Compartilhar"
            variant="ghost"
            size="sm"
            onPress={onShare}
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={onRevoke}
            style={styles.revokeBtn}
            hitSlop={8}
          >
            <Trash2 size={16} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  intro: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introHint: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  expirySection: {
    marginTop: spacing.sm,
  },
  expiryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  expiryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  expiryBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  expiryBtnText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  expiryBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  shareCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadow.sm,
  },
  shareCardInactive: {
    opacity: 0.5,
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareToken: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  shareUrl: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  shareMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: spacing.xs,
  },
  shareMetaText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  shareActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  revokeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.danger + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
}), [themeVersion]);
}
