import {useState, useMemo } from 'react';
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

import { Bell, Check, X } from '@/components/Icon';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

export type ReminderOption = {
  /** null = usar default da pref global; outro valor = minutos antes */
  value: number | null;
  label: string;
};

export const REMINDER_OPTIONS: ReminderOption[] = [
  { value: null, label: 'Usar padrão das configurações' },
  { value: 0, label: 'No horário' },
  { value: 15, label: '15 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 180, label: '3 horas antes' },
  { value: 1440, label: '1 dia antes' },
  { value: 2880, label: '2 dias antes' },
];

type Props = {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Se true, mostra hint que o user pode desativar nas configurações. */
  showHint?: boolean;
};

/**
 * Campo "Lembrete" pra ser usado em modais de tarefa.
 * Renderiza como um botão com ícone de sino + label da opção atual.
 * Tap abre um bottom-sheet com lista de opções (uma por linha — bem mais legível).
 */
export function ReminderField({ value, onChange, showHint }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  const current =
    REMINDER_OPTIONS.find((o) => o.value === value) ?? REMINDER_OPTIONS[0];

  return (
    <>
      <View style={styles.wrap}>
        <Text style={styles.label}>Lembrete</Text>
        <Pressable
          onPress={() => setOpen(true)}
          style={styles.button}
        >
          <View style={styles.iconBox}>
            <Bell size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.buttonValue}>{current.label}</Text>
            {showHint && (
              <Text style={styles.buttonHint}>Toque pra alterar</Text>
            )}
          </View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Lembrete</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView style={styles.list}>
                {REMINDER_OPTIONS.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={String(opt.value)}
                      onPress={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      style={[styles.row, active && styles.rowActive]}
                    >
                      <Text style={styles.rowLabel}>{opt.label}</Text>
                      {active && (
                        <Check size={18} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  buttonHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  // Sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '70%',
    ...shadow.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rowActive: {
    backgroundColor: colors.primarySoft,
  },
  rowLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
}), [themeVersion]);
}
