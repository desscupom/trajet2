/**
 * BottomSheet — componente base para todos os modais bottom-up do Trajet.
 * Substitui o padrão inconsistente de Modal + SafeAreaView + styles ad-hoc.
 *
 * Features:
 * - Drag indicator no topo
 * - Sombra e backdrop animados
 * - SafeArea automática
 * - Suporte a scroll interno
 * - Header com título, subtítulo e botão fechar
 */
import { useMemo, type ReactNode } from 'react';
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
import { X } from '@/components/Icon';
import { AnimatedPress } from '@/components/AnimatedPress';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, shadow, spacing } from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Se true, o conteúdo fica dentro de ScrollView */
  scrollable?: boolean;
  /** Altura máxima. Default: 92% da tela */
  maxHeightPct?: number;
  /** Não mostra botão de fechar no header */
  hideClose?: boolean;
  /** Conteúdo que vai abaixo do header, dentro do scroll */
  children: ReactNode;
  /** Conteúdo fixo na parte inferior (fora do scroll) */
  footer?: ReactNode;
  /** Slot extra no header à direita */
  headerRight?: ReactNode;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  scrollable = true,
  maxHeightPct = 0.92,
  hideClose = false,
  children,
  footer,
  headerRight,
}: Props) {
  const styles = useStyles(maxHeightPct);
  const hasHeader = !!(title || subtitle || !hideClose || headerRight);

  const inner = (
    <View style={styles.inner}>
      {/* Drag indicator */}
      <View style={styles.dragIndicator} />

      {/* Header */}
      {hasHeader && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          <View style={styles.headerActions}>
            {headerRight}
            {!hideClose && (
              <AnimatedPress onPress={onClose} pressScale={0.88} style={styles.closeBtn}>
                <X size={16} color={colors.textMuted} />
              </AnimatedPress>
            )}
          </View>
        </View>
      )}

      {/* Body */}
      {scrollable ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.staticContent}>{children}</View>
      )}

      {/* Footer */}
      {footer && <View style={styles.footer}>{footer}</View>}

      {/* SafeArea bottom */}
      <SafeAreaView edges={['bottom']} />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Sheet */}
        <View style={styles.sheet}>
          {inner}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function useStyles(maxHeightPct: number) {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: `${Math.round(maxHeightPct * 100)}%` as any,
      ...shadow.lg,
    },
    inner: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      overflow: 'hidden',
    },
    dragIndicator: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      gap: spacing.sm,
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: colors.text,
      fontSize: fontSize.lg,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: fontSize.sm,
      lineHeight: 18,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: 2,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    staticContent: {
      padding: spacing.lg,
    },
    footer: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      gap: spacing.sm,
    },
  }), [themeVersion, maxHeightPct]);
}
