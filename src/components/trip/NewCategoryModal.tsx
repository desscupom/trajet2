import {useEffect, useState, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';

import { Button } from '@/components/Button';
import { X } from '@/components/Icon';
import { Input } from '@/components/Input';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { createCustomCategory } from '@/hooks/useExpenseCategories';
import {
  CUSTOM_ICON_OPTIONS,
  type CategoryIconName,
  getIconByName,
} from '@/lib/expenseIcons';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Chamado com o slug da nova categoria após criar com sucesso. */
  onCreated: (slug: string) => void;
  tripId: string;
};

/**
 * Modal pra criar uma nova categoria de despesa customizada.
 * - Input do nome
 * - Grade de ícones pra escolher
 * - Validação básica
 */
export function NewCategoryModal({ visible, onClose, onCreated, tripId }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { user } = useAuth();

  const [label, setLabel] = useState('');
  const [iconName, setIconName] = useState<CategoryIconName>(CUSTOM_ICON_OPTIONS[0]);
  const [saving, setSaving] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (visible) {
      setLabel('');
      setIconName(CUSTOM_ICON_OPTIONS[0]);
    }
  }, [visible]);

  async function handleCreate() {
    if (!user) return;
    if (label.trim().length < 2) {
      toast.error('Dê um nome pra categoria.');
      return;
    }
    setSaving(true);
    const { slug, error } = await createCustomCategory(
      tripId,
      label,
      iconName,
      user.id,
    );
    setSaving(false);
    if (error || !slug) {
      toast.error(error ?? 'Erro ao criar categoria.');
      return;
    }
    toast.success('Categoria criada.');
    onCreated(slug);
    onClose();
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
          <Text style={styles.title}>Nova categoria</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Nome"
              value={label}
              onChangeText={setLabel}
              placeholder="Ex: Lembranças, Passeios de barco"
              autoCapitalize="sentences"
              autoFocus
            />

            <View>
              <Text style={styles.iconLabel}>Ícone</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.iconRow}
                keyboardShouldPersistTaps="handled"
              >
                {CUSTOM_ICON_OPTIONS.map((name) => {
                  const Icon = getIconByName(name);
                  const active = name === iconName;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setIconName(name)}
                      style={[
                        styles.iconBtn,
                        active && styles.iconBtnActive,
                      ]}
                    >
                      <Icon
                        size={20}
                        color={active ? colors.primary : colors.text}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Button
              title="Criar categoria"
              onPress={handleCreate}
              loading={saving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  body: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  iconLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  iconRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
}), [themeVersion]);
}
