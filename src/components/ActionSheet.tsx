/**
 * ActionSheet — menu de ações customizado com visual bonito.
 * Substitui o Alert.alert nativo para menus de opções.
 */
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export type ActionSheetOption = {
  label: string;
  sublabel?: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Se true, renderiza um separador de seção acima */
  section?: string;
};

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: ActionSheetOption[];
  onClose: () => void;
};

export function ActionSheet({ visible, title, subtitle, options, onClose }: Props) {
  const styles = useStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView edges={['bottom']} style={styles.container}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            {(title || subtitle) && (
              <View style={styles.header}>
                {title && <Text style={styles.title}>{title}</Text>}
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
            )}

            {/* Opções */}
            <View style={styles.options}>
              {options.map((opt, i) => (
                <View key={i}>
                  {opt.section && (
                    <View style={styles.sectionRow}>
                      <Text style={styles.sectionLabel}>{opt.section}</Text>
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      i < options.length - 1 && styles.optionBorder,
                      pressed && styles.optionPressed,
                      opt.disabled && styles.optionDisabled,
                    ]}
                    onPress={() => {
                      if (opt.disabled) return;
                      onClose();
                      setTimeout(opt.onPress, 200);
                    }}
                    disabled={opt.disabled}
                  >
                    {opt.icon && (
                      <View style={styles.optionIconWrap}>
                        <Text style={styles.optionIcon}>{opt.icon}</Text>
                      </View>
                    )}
                    <View style={styles.optionBody}>
                      <Text style={[
                        styles.optionLabel,
                        opt.destructive && styles.optionDestructive,
                        opt.disabled && styles.optionLabelDisabled,
                      ]}>
                        {opt.label}
                      </Text>
                      {opt.sublabel && (
                        <Text style={styles.optionSublabel}>{opt.sublabel}</Text>
                      )}
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Cancelar */}
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.optionPressed]}
              onPress={onClose}
            >
              <Text style={styles.cancelLabel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    sheet: {
      gap: spacing.sm,
    },
    header: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    options: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    optionBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionPressed: {
      backgroundColor: colors.surfaceAlt,
    },
    optionDisabled: {
      opacity: 0.4,
    },
    sectionRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: 4,
      backgroundColor: colors.surfaceAlt,
    },
    sectionLabel: {
      fontSize: 10, fontWeight: '700',
      letterSpacing: 0.8, color: colors.textMuted,
      textTransform: 'uppercase',
    },
    optionIconWrap: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    optionIcon: {
      fontSize: 18,
    },
    optionBody: { flex: 1 },
    optionLabel: {
      fontSize: fontSize.md,
      color: colors.text,
      fontWeight: '500',
    },
    optionSublabel: {
      fontSize: fontSize.xs,
      color: colors.textMuted,
      marginTop: 1,
    },
    optionDestructive: {
      color: colors.danger,
    },
    optionLabelDisabled: {
      color: colors.textMuted,
    },
    cancelBtn: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelLabel: {
      fontSize: fontSize.md,
      fontWeight: '600',
      color: colors.text,
    },
  }), [themeVersion]);
}
