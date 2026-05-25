import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import {useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import {
  Copy,
  MessageCircle,
  QrCode,
  Share as ShareIcon,
  Trash,
} from '@/components/Icon';
import { QRCodeModal } from '@/components/QRCodeModal';
import { useAuth } from '@/hooks/useAuth';
import { useTripMembers, type TripMemberWithProfile } from '@/hooks/useTripMembers';
import { formatDateRangeBR } from '@/lib/dates';
import { buildInviteUrl, createInvite } from '@/lib/invites';
import { supabase, type Trip } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  trip: Trip;
  visible: boolean;
  onClose: () => void;
};

export function ManageMembersModal({ trip, visible, onClose }: Props) {
  const styles = useStyles();
  const { user } = useAuth();
  const router = useRouter();
  const { members, invites, loading, refetch } = useTripMembers(trip.id);
  const [creating, setCreating] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const isOwner = user?.id === trip.owner_id;
  const tripDateRange = formatDateRangeBR(trip.start_date, trip.end_date) || null;

  async function handleCreateInvite() {
    if (!user) return;
    setCreating(true);
    const { token, error } = await createInvite(
      { tripId: trip.id, role: 'editor', expiresInDays: 30 },
      user.id
    );
    setCreating(false);

    if (error || !token) {
      Alert.alert('Erro', error ?? 'Não consegui criar o convite.');
      return;
    }

    const url = buildInviteUrl(token);
    refetch();
    shareInvite(url, trip.title);
  }

  async function handleRevokeInvite(inviteId: string) {
    Alert.alert('Revogar convite?', 'O link deixará de funcionar imediatamente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Revogar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('trip_invites')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', inviteId);
          if (error) Alert.alert('Erro', error.message);
          else refetch();
        },
      },
    ]);
  }

  async function handleRemoveMember(member: TripMemberWithProfile) {
    if (member.role === 'owner') {
      Alert.alert('Não é possível', 'O dono da viagem não pode ser removido.');
      return;
    }
    const memberName = member.profile?.full_name || member.profile?.email || 'esse membro';
    Alert.alert(
      `Remover ${memberName}?`,
      'A pessoa perderá acesso à viagem imediatamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('trip_members')
              .delete()
              .eq('id', member.id);
            if (error) Alert.alert('Erro', error.message);
            else refetch();
          },
        },
      ]
    );
  }

  async function handleLeaveTrip() {
    if (!user) return;
    Alert.alert(
      'Sair desta viagem?',
      'Você perderá acesso a tudo e precisará de novo convite para voltar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            const myMember = members.find((m) => m.profile_id === user.id);
            if (!myMember) return;
            const { error } = await supabase
              .from('trip_members')
              .delete()
              .eq('id', myMember.id);
            if (error) {
              Alert.alert('Erro', error.message);
            } else {
              onClose();
              router.replace('/(app)');
            }
          },
        },
      ]
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
          <View style={styles.headerDragBar} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Membros da viagem</Text>
              <Text style={styles.subtitle}>{members.length} {members.length === 1 ? 'viajante' : 'viajantes'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Membros */}
            <Text style={styles.sectionLabel}>
              {members.length} {members.length === 1 ? 'membro' : 'membros'}
            </Text>
            <View style={styles.list}>
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isMe={m.profile_id === user?.id}
                  canRemove={isOwner && m.role !== 'owner'}
                  onRemove={() => handleRemoveMember(m)}
                />
              ))}
            </View>

            {/* Convites pendentes (só owner vê e gerencia) */}
            {isOwner && (
              <>
                <Text style={[styles.sectionLabel, styles.sectionSpaced]}>
                  Convites ativos
                </Text>
                {invites.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum convite ativo no momento.</Text>
                ) : (
                  <View style={styles.list}>
                    {invites.map((inv) => {
                      const url = buildInviteUrl(inv.token);
                      return (
                        <View key={inv.id} style={styles.inviteCard}>
                          <View style={styles.inviteInfo}>
                            <Text style={styles.inviteLink} numberOfLines={1}>
                              {url}
                            </Text>
                            <Text style={styles.inviteMeta}>
                              {inv.uses} uso{inv.uses !== 1 ? 's' : ''}
                              {inv.expires_at
                                ? ` · expira em ${formatExpiry(inv.expires_at)}`
                                : ' · sem expiração'}
                            </Text>
                          </View>
                          <View style={styles.inviteActions}>
                            <Pressable
                              onPress={() => copyInvite(url)}
                              hitSlop={6}
                              style={styles.iconBtn}
                            >
                              <Copy size={16} color={colors.text} />
                            </Pressable>
                            <Pressable
                              onPress={() => setQrUrl(url)}
                              hitSlop={6}
                              style={styles.iconBtn}
                            >
                              <QrCode size={16} color={colors.text} />
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                shareViaWhatsApp(url, trip.title, tripDateRange)
                              }
                              hitSlop={6}
                              style={[styles.iconBtn, styles.iconBtnWhatsApp]}
                            >
                              <MessageCircle size={16} color="#fff" />
                            </Pressable>
                            <Pressable
                              onPress={() => shareInvite(url, trip.title)}
                              hitSlop={6}
                              style={styles.iconBtn}
                            >
                              <ShareIcon size={16} color={colors.text} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleRevokeInvite(inv.id)}
                              hitSlop={6}
                              style={[styles.iconBtn, styles.iconBtnDanger]}
                            >
                              <Trash size={16} color={colors.danger} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                <Button
                  title="+ Gerar novo convite"
                  variant="secondary"
                  onPress={handleCreateInvite}
                  loading={creating}
                  style={styles.newInviteBtn}
                />
              </>
            )}

            {/* Sair (não-owner) */}
            {!isOwner && (
              <View style={styles.dangerZone}>
                <Button
                  title="Sair desta viagem"
                  variant="ghost"
                  onPress={handleLeaveTrip}
                />
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <QRCodeModal
        visible={!!qrUrl}
        onClose={() => setQrUrl(null)}
        url={qrUrl ?? ''}
        tripTitle={trip.title}
      />
    </Modal>
  );
}

function MemberRow({
  member,
  isMe,
  canRemove,
  onRemove,
}: {
  member: TripMemberWithProfile;
  isMe: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const name = member.profile?.full_name || member.profile?.email || 'Sem nome';
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={styles.memberRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
          {isMe && <Text style={styles.youTag}> (você)</Text>}
        </Text>
        <Text style={styles.memberEmail} numberOfLines={1}>
          {member.profile?.email}
        </Text>
      </View>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{translateRole(member.role)}</Text>
      </View>
      {canRemove && (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
          <Text style={styles.removeText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function translateRole(role: string): string {
  switch (role) {
    case 'owner':
      return 'Criou a viagem';
    case 'editor':
      return 'Editor';
    case 'viewer':
      return 'Visualizador';
    default:
      return role;
  }
}

function formatExpiry(iso: string): string {
  const days = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) return 'expirado';
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

async function copyInvite(url: string) {
  await Clipboard.setStringAsync(url);
  if (Platform.OS === 'web') {
    // Alert no web é feio; usamos alert nativo
    window.alert('Link copiado!');
  } else {
    Alert.alert('Copiado', 'Link copiado para a área de transferência.');
  }
}

async function shareInvite(url: string, tripTitle: string) {
  const message = `Estou organizando nossa viagem para ${tripTitle} no Trajet! 🗺️\n\nEntre no grupo para planejarmos juntos:\n${url}`;
  try {
    if (Platform.OS === 'web' && navigator.share) {
      await navigator.share({ title: tripTitle, text: message });
    } else if (Platform.OS !== 'web') {
      // Não passar "url" separado — o iOS concatena com message gerando link duplicado
      await Share.share({ message, title: tripTitle });
    } else {
      copyInvite(url);
    }
  } catch {
    copyInvite(url);
  }
}

// Abre o WhatsApp já com a mensagem pré-preenchida.
// O link wa.me funciona em iOS, Android e web; redireciona pro app instalado
// se houver, senão abre WhatsApp Web.
async function shareViaWhatsApp(url: string, tripTitle: string, tripDates?: string | null) {
  const greeting = `Oi! 👋`;
  const intro = `Tô organizando uma viagem${
    tripDates ? ` (${tripDates})` : ''
  } e queria você junto: *${tripTitle}*`;
  const tool = `Tô usando o Trajet pra planejar tudo — roteiro, lugares, despesas. Topa entrar?`;
  const linkLine = `\n${url}`;

  const message = `${greeting}\n\n${intro}\n\n${tool}\n${linkLine}`;
  const encoded = encodeURIComponent(message);
  const waUrl = `https://wa.me/?text=${encoded}`;

  if (Platform.OS === 'web') {
    window.open(waUrl, '_blank');
    return;
  }
  // Mobile: tenta abrir o app via Linking
  try {
    const Linking = require('expo-linking');
    const supported = await Linking.canOpenURL(waUrl);
    if (supported) {
      await Linking.openURL(waUrl);
    } else {
      Alert.alert('WhatsApp não encontrado', 'Instale o WhatsApp para usar essa opção.');
    }
  } catch {
    Alert.alert('Erro', 'Não consegui abrir o WhatsApp.');
  }
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  headerDragBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scrollContent: { padding: spacing.lg, gap: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionSpaced: { marginTop: spacing.xl },
  list: { gap: spacing.sm },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  memberInfo: { flex: 1 },
  memberName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  youTag: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  memberEmail: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  roleText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
  },
  inviteCard: {
    flexDirection: 'column',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteInfo: { flex: 1 },
  inviteLink: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  inviteMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnWhatsApp: {
    backgroundColor: '#25D366', // verde WhatsApp
    borderColor: '#1eb858',
  },
  iconBtnDanger: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  iconText: { fontSize: 14 },
  newInviteBtn: { marginTop: spacing.md },
  dangerZone: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
}), [themeVersion]);
}
