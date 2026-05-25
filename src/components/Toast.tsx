import {createContext, useCallback, useContext, useEffect, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CircleAlert, CircleCheck, X } from '@/components/Icon';
import { colors, fontSize, radius, shadow, spacing } from '@/lib/theme';

type ToastVariant = 'success' | 'error' | 'info';

type ToastInternal = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const [toasts, setToasts] = useState<ToastInternal[]>([]);

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  };

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <SafeAreaView
        style={[styles.host, { pointerEvents: 'box-none' }]}
        edges={['bottom']}
      >
        <View style={[styles.stack, { pointerEvents: 'box-none' }]}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </View>
      </SafeAreaView>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}

function ToastItem({ toast, onDismiss }: { toast: ToastInternal; onDismiss: () => void }) {
  const styles = useStyles();
  // Reanimated entry: spring vindo de baixo + fade
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withSpring(0, {
      damping: 16,
      stiffness: 200,
      mass: 0.7,
    });
    scale.value = withSpring(1, {
      damping: 18,
      stiffness: 220,
    });
  }, [opacity, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const palette = variantPalette[toast.variant];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: palette.bg, borderColor: palette.border },
        animatedStyle,
      ]}
    >
      <View style={styles.icon}>{palette.icon}</View>
      <Text style={[styles.message, { color: palette.textColor }]} numberOfLines={2}>
        {toast.message}
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.close}>
        <X size={16} color={palette.textColor} />
      </Pressable>
    </Animated.View>
  );
}

// Cores sólidas (não semi-transparentes) pra garantir legibilidade em qualquer tema.
// No light: fundo claro colorido. No dark: fundo escuro colorido.
// Usamos hex direto pra evitar depender de cores do tema que podem ser rgba().
const variantPalette = {
  success: {
    bg: '#166534',     // verde escuro — lê bem em dark e light sobre fundo sólido
    border: '#16a34a',
    icon: <CircleCheck size={18} color="#86efac" />,
    textColor: '#dcfce7',
  },
  error: {
    bg: '#7f1d1d',
    border: '#dc2626',
    icon: <CircleAlert size={18} color="#fca5a5" />,
    textColor: '#fee2e2',
  },
  info: {
    bg: colors.surface,
    border: colors.border,
    icon: <CircleAlert size={18} color={colors.primary} />,
    textColor: colors.text,
  },
};

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  host: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  stack: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    flexDirection: 'column-reverse',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadow.lg,
    // Garante que nunca seja transparente independente do tema
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  message: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  close: {
    padding: 2,
  },
}), [themeVersion]);
}
