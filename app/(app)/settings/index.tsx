import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPress } from '@/components/AnimatedPress';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FadeInView } from '@/components/FadeInView';
import {
  Bell,
  BellRing,
  AlertTriangle,
  ChevronRight,
  Download,
  Edit,
  LogOut,
  Moon,
  RefreshCw,
  Sparkles,
  Trash,
  User as UserIcon,
  Camera as CameraIcon,
} from '@/components/Icon';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { useTheme } from '@/components/ThemeProvider';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useToast } from '@/components/Toast';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { removeAvatar, uploadAvatar } from '@/lib/avatar';
import { validatePassword } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { pref: themePref } = useTheme();
  const unreadCount = useUnreadNotifications();
  const toast = useToast();
  const { user } = useAuth();
  const { profile, loading, refetch } = useProfile();
  const [stats, setStats] = useState({ trips: 0 });

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('trips').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
      supabase.from('trip_members').select('id', { count: 'exact', head: true }).eq('profile_id', user.id),
    ]).then(([owned, member]) => {
      setStats({ trips: (owned.count ?? 0) + (member.count ?? 0) });
    }).catch(() => {});
  }, [user?.id]);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMode, setPwdMode] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  if (loading || !profile || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <Skeleton height={120} borderRadius={radius.lg} />
          <View style={{ height: spacing.md }} />
          <Skeleton height={80} borderRadius={radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  function startEditName() {
    setNameValue(profile?.full_name ?? '');
    setEditingName(true);
  }

  async function saveName() {
    if (!nameValue.trim()) {
      toast.error('Nome não pode ficar vazio.');
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: nameValue.trim() })
      .eq('id', profile!.id);
    setSavingName(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingName(false);
    refetch();
    toast.success('Nome atualizado.');
  }

  async function handlePickPhoto() {
    // Pede permissão
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Precisamos de permissão pra acessar sua galeria.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    const { publicUrl, error } = await uploadAvatar(
      profile!.id,
      asset.uri,
      asset.mimeType ?? 'image/jpeg'
    );
    setUploadingPhoto(false);

    if (error) {
      toast.error(error);
      return;
    }
    if (publicUrl) {
      refetch();
      toast.success('Foto atualizada!');
    }
  }

  async function handleRemovePhoto() {
    Alert.alert('Remover foto?', 'Sua foto de perfil será apagada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeAvatar(profile!.id, profile!.avatar_url);
          refetch();
          toast.success('Foto removida.');
        },
      },
    ]);
  }

  async function handleChangePassword() {
    const { ok, error: pwdError } = validatePassword(newPassword);
    if (!ok) {
      toast.error(pwdError!);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não conferem.');
      return;
    }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPwd(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPwdMode(false);
    toast.success('Senha alterada com sucesso.');
  }

  async function handleChangeEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Digite um email válido.');
      return;
    }
    if (trimmed === profile?.email?.toLowerCase()) {
      toast.error('O novo email é igual ao atual.');
      return;
    }
    setChangingEmail(true);
    try {
      // Verifica se email já está em uso
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', trimmed)
        .neq('id', user?.id ?? '')
        .maybeSingle();

      if (existing) {
        toast.error('Este email já está cadastrado em outra conta.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) {
        toast.error(error.message);
        return;
      }
      setEmailMode(false);
      setNewEmail('');
      toast.success('Confirmação enviada para o novo email. Verifique sua caixa de entrada.');
    } finally {
      setChangingEmail(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sair da conta?', 'Você precisará entrar de novo depois.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  async function handleExportData() {
    if (!user) return;
    Alert.alert(
      'Exportar meus dados (LGPD)',
      'Vamos gerar um arquivo JSON com todas as suas viagens, despesas, tarefas e preferências.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Exportar',
          onPress: async () => {
            try {
              const [tripsRes, expRes, tasksRes, profileRes] = await Promise.all([
                supabase.from('trips').select('*').or(`owner_id.eq.${user.id}`),
                supabase.from('expenses').select('*'),
                supabase.from('tasks').select('*'),
                supabase.from('profiles').select('*').eq('id', user.id).single(),
              ]);
              const exportData = {
                exported_at: new Date().toISOString(),
                profile: profileRes.data,
                trips: tripsRes.data ?? [],
                expenses: expRes.data ?? [],
                tasks: tasksRes.data ?? [],
              };
              const json = JSON.stringify(exportData, null, 2);
              const uri = `${FileSystem.cacheDirectory}trajet_meus_dados.json`;
              await FileSystem.writeAsStringAsync(uri, json);
              await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Exportar dados Trajet' });
            } catch {
              toast.error('Erro ao exportar dados.');
            }
          },
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Excluir conta?',
      'Essa ação é permanente. Suas viagens, despesas e tudo mais serão apagados pra sempre.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir mesmo assim',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Tem certeza?',
              'Última chance. Não dá pra desfazer depois.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Excluir conta',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await supabase.rpc('delete_my_account');
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    await supabase.auth.signOut();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* PERFIL — card hero */}
          <FadeInView>
            <View style={styles.profileCard}>
              <View style={styles.profileHero}>
                <AnimatedPress onPress={handlePickPhoto} pressScale={0.95} style={styles.avatarWrap} disabled={uploadingPhoto}>
                  <Avatar url={profile.avatar_url} name={profile.full_name} email={profile.email} size={88} />
                  <View style={styles.avatarEditBadge}>
                    <CameraIcon size={14} color="#fff" />
                  </View>
                </AnimatedPress>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {profile.full_name || 'Sem nome'}
                  </Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {profile.email}
                  </Text>
                  <View style={styles.profileBadges}>
                    <View style={styles.profileBadge}>
                      <Text style={styles.profileBadgeText}>✈️ {stats.trips} viagen{stats.trips !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                </View>
              </View>
              {profile.avatar_url && (
                <Pressable onPress={handleRemovePhoto} hitSlop={8} style={{ alignSelf: 'center', marginTop: spacing.xs }}>
                  <Text style={styles.removePhotoLink}>Remover foto</Text>
                </Pressable>
              )}
            </View>
          </FadeInView>

          {/* NOME */}
          <FadeInView delay={60}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Perfil</Text>
              {editingName ? (
                <View style={styles.editRow}>
                  <Input
                    label="Nome completo"
                    value={nameValue}
                    onChangeText={setNameValue}
                    autoFocus
                    autoCapitalize="words"
                  />
                  <View style={styles.editActions}>
                    <Button
                      title="Cancelar"
                      variant="ghost"
                      onPress={() => setEditingName(false)}
                    />
                    <Button
                      title="Salvar"
                      onPress={saveName}
                      loading={savingName}
                    />
                  </View>
                </View>
              ) : (
                <AnimatedPress
                  style={styles.row}
                  pressScale={0.99}
                  onPress={startEditName}
                >
                  <View style={styles.rowIconWrap}>
                    <UserIcon size={18} color={colors.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>Nome</Text>
                    <Text style={styles.rowValue}>
                      {profile.full_name || '—'}
                    </Text>
                  </View>
                  <Edit size={16} color={colors.textMuted} />
                </AnimatedPress>
              )}

              {emailMode ? (
                <View style={styles.editRow}>
                  <Input
                    label="Novo email"
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder={profile.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <Button title="Cancelar" variant="ghost" onPress={() => { setEmailMode(false); setNewEmail(''); }} />
                    <Button title="Alterar" onPress={handleChangeEmail} loading={changingEmail} />
                  </View>
                </View>
              ) : (
                <AnimatedPress style={styles.row} pressScale={0.99} onPress={() => { setNewEmail(profile.email); setEmailMode(true); }}>
                  <View style={styles.rowIconWrap}>
                    <UserIcon size={18} color={colors.textMuted} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>Email</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>{profile.email}</Text>
                  </View>
                  <Edit size={14} color={colors.textMuted} />
                </AnimatedPress>
              )}
            </View>
          </FadeInView>

          {/* CONTA */}
          <FadeInView delay={120}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Conta</Text>

              {pwdMode ? (
                <View style={styles.editRow}>
                  <Input
                    label="Nova senha"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Mínimo 8 caracteres"
                    secureTextEntry
                    autoFocus
                  />
                  {newPassword.length > 0 && (
                    <PasswordStrengthMeter password={newPassword} />
                  )}
                  <Input
                    label="Confirmar nova senha"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Digite de novo"
                    secureTextEntry
                  />
                  <View style={styles.editActions}>
                    <Button
                      title="Cancelar"
                      variant="ghost"
                      onPress={() => {
                        setPwdMode(false);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                    />
                    <Button
                      title="Alterar"
                      onPress={handleChangePassword}
                      loading={changingPwd}
                    />
                  </View>
                </View>
              ) : (
                <AnimatedPress
                  style={styles.row}
                  pressScale={0.99}
                  onPress={() => setPwdMode(true)}
                >
                  <View style={styles.rowIconWrap}>
                    <UserIcon size={18} color={colors.textMuted} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>Senha</Text>
                    <Text style={styles.rowValue}>••••••••</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </AnimatedPress>
              )}
            </View>
          </FadeInView>

          {/* PREFERÊNCIAS */}
          <FadeInView delay={150}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Preferências</Text>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/notifications')}
              >
                <View style={styles.rowIconWrap}>
                  <Bell size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Caixa de notificações</Text>
                  <Text style={styles.rowValue}>
                    {unreadCount > 0
                      ? `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}`
                      : 'Tudo em dia'}
                  </Text>
                </View>
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/reminders')}
              >
                <View style={styles.rowIconWrap}>
                  <BellRing size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Meus lembretes</Text>
                  <Text style={styles.rowValue}>
                    Lembretes personalizados
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/templates')}
              >
                <View style={styles.rowIconWrap}>
                  <Sparkles size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Galeria de roteiros</Text>
                  <Text style={styles.rowValue}>
                    Roteiros IA reaproveitáveis
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/settings/friends' as any)}
              >
                <View style={styles.rowIconWrap}>
                  <UserIcon size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Amigos</Text>
                  <Text style={styles.rowValue}>Adicione amigos para viajar juntos</Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/settings/notifications')}
              >
                <View style={styles.rowIconWrap}>
                  <Bell size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Preferências de notificação</Text>
                  <Text style={styles.rowValue}>
                    Lembretes e atualizações
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/settings/appearance')}
              >
                <View style={styles.rowIconWrap}>
                  <Moon size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Aparência</Text>
                  <Text style={styles.rowValue}>
                    {themePref === 'system'
                      ? 'Seguir sistema'
                      : themePref === 'light'
                        ? 'Modo claro'
                        : 'Modo escuro'}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/settings/sync')}
              >
                <View style={styles.rowIconWrap}>
                  <RefreshCw size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Sincronização</Text>
                  <Text style={styles.rowValue}>
                    Mudanças pendentes e fila offline
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>

              <AnimatedPress
                style={styles.row}
                pressScale={0.99}
                onPress={() => router.push('/(app)/settings/safety' as any)}
              >
                <View style={styles.rowIconWrap}>
                  <AlertTriangle size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Alertas de segurança</Text>
                  <Text style={styles.rowValue}>
                    Configure quais alertas deseja ver nos locais
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>
            </View>
          </FadeInView>

          {/* LGPD — Exportar dados */}
          <FadeInView delay={205}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Privacidade (LGPD)</Text>
              <AnimatedPress style={styles.row} pressScale={0.99} onPress={handleExportData}>
                <View style={styles.rowIconWrap}>
                  <Download size={18} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Exportar meus dados</Text>
                  <Text style={styles.rowValueMuted}>Baixe tudo em formato JSON</Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </AnimatedPress>
            </View>
          </FadeInView>

          {/* ZONA PERIGOSA */}
          <FadeInView delay={210}>
            <View style={styles.dangerSection}>
              <Text style={styles.dangerLabel}>Zona perigosa</Text>
              <AnimatedPress
                style={styles.rowDanger}
                pressScale={0.99}
                onPress={handleDeleteAccount}
              >
                <View style={[styles.rowIconWrap, styles.rowIconDanger]}>
                  <Trash size={18} color={colors.danger} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabelDanger}>Excluir conta</Text>
                  <Text style={styles.rowValueMuted}>
                    Apaga tudo permanentemente
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.danger} />
              </AnimatedPress>
            </View>
          </FadeInView>

          {/* SAIR — sempre o último botão de ação */}
          <FadeInView delay={230}>
            <AnimatedPress
              style={styles.signOutRow}
              pressScale={0.99}
              onPress={handleSignOut}
            >
              <LogOut size={16} color={colors.warning} />
              <Text style={styles.signOutText}>Sair da conta</Text>
            </AnimatedPress>
          </FadeInView>

          {/* SOBRE */}
          <FadeInView delay={240}>
            <Text style={styles.aboutText}>Trajet · v1.0.0</Text>
          </FadeInView>
        </ScrollView>
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  profileEmail: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  profileBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  profileBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  profileBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarActions: {
    flex: 1,
    gap: spacing.sm,
  },
  removePhotoLink: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '500',
    paddingTop: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: spacing.xs,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rowIconWarn: {
    backgroundColor: colors.warningSoft,
  },
  rowIconDanger: {
    backgroundColor: colors.dangerSoft,
  },
  rowContent: { flex: 1 },
  rowLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  rowValue: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  rowValueMuted: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  rowDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  rowLabelDanger: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  dangerSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  dangerLabel: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  editRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.md,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  signOutText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  aboutText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}), [themeVersion]);
}
