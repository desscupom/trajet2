import {useEffect, useState, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fontSize } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

// Paletas pré-definidas. A partir do nome do user, escolhemos uma
// determinística (mesmo nome = mesma cor). Combinam com o tema dark.
const GRADIENT_PALETTES: [string, string][] = [
  ['#14b8a6', '#0d9488'], // teal (primary)
  ['#3b82f6', '#1d4ed8'], // blue
  ['#8b5cf6', '#6d28d9'], // violet
  ['#ec4899', '#be185d'], // pink
  ['#f59e0b', '#b45309'], // amber
  ['#10b981', '#047857'], // emerald
  ['#06b6d4', '#0e7490'], // cyan
  ['#f43f5e', '#9f1239'], // rose
  ['#a855f7', '#7e22ce'], // purple
  ['#84cc16', '#4d7c0f'], // lime
];

type AvatarProps = {
  url?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  /** Ring teal pra destacar (ex: "você" no members modal). */
  ring?: boolean;
};

/**
 * Avatar com fallback de iniciais sobre gradient único por pessoa.
 *
 * - Com foto: mostra imagem com fade-in suave.
 * - Sem foto: gradient determinístico pelo nome + iniciais centralizadas.
 * - Ring opcional pra destacar (ex: o usuário atual).
 */
export function Avatar({ url, name, email, size = 48, ring }: AvatarProps) {
  const styles = useStyles();
  const initials = getInitials(name, email);
  const palette = pickGradient(name || email || '?');

  // Fade-in da imagem quando carregar
  const imgOpacity = useSharedValue(url ? 0 : 1);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (!url) imgOpacity.value = 1;
    else imgOpacity.value = imgLoaded ? withTiming(1, { duration: 220 }) : 0;
  }, [url, imgLoaded, imgOpacity]);

  const animatedImageStyle = useAnimatedStyle(() => ({
    opacity: imgOpacity.value,
  }));

  // Quando tem ring, o avatar "interno" precisa ser um pouco menor
  const ringWidth = ring ? 2 : 0;
  const inner = size - ringWidth * 2;

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        ring && styles.ringActive,
      ]}
    >
      <View
        style={[
          styles.container,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          },
        ]}
      >
        {/* Background — cor sólida (sem LinearGradient para evitar crash iOS 26) */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: inner,
            height: inner,
            backgroundColor: palette[0],
          }}
        />

        {/* Iniciais — visíveis embaixo da imagem, ou sozinhas se sem url */}
        <Text
          style={[styles.initials, { fontSize: inner * 0.38 }]}
          allowFontScaling={false}
        >
          {initials}
        </Text>

        {/* Foto por cima, com fade-in */}
        {url && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: inner,
                height: inner,
              },
              animatedImageStyle,
            ]}
          >
            <Image
              source={{ uri: url }}
              onLoad={() => setImgLoaded(true)}
              style={[
                styles.image,
                {
                  width: inner,
                  height: inner,
                  borderRadius: inner / 2,
                },
              ]}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/**
 * Stack de avatares sobrepostos. Usado pra mostrar membros de uma viagem.
 * Mostra até `max` avatares; se houver mais, mostra "+N" no final.
 */
export function AvatarStack({
  users,
  size = 28,
  max = 4,
}: {
  users: { url?: string | null; name?: string | null; email?: string | null }[];
  size?: number;
  max?: number;
}) {
  const styles = useStyles();
  const visible = users.slice(0, max);
  const remaining = users.length - visible.length;
  const overlap = size * 0.35; // sobreposição

  return (
    <View style={styles.stack}>
      {visible.map((u, idx) => (
        <View
          key={idx}
          style={[
            { marginLeft: idx === 0 ? 0 : -overlap, zIndex: visible.length - idx },
            styles.stackItem,
          ]}
        >
          <Avatar url={u.url} name={u.name} email={u.email} size={size} />
        </View>
      ))}
      {remaining > 0 && (
        <View
          style={[
            styles.stackItem,
            styles.stackMore,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -overlap,
            },
          ]}
        >
          <Text
            style={[styles.stackMoreText, { fontSize: size * 0.38 }]}
            allowFontScaling={false}
          >
            +{remaining}
          </Text>
        </View>
      )}
    </View>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = (name ?? '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

/**
 * Determinístico — mesmo nome retorna sempre a mesma paleta.
 * Hash simples da string sobre o array de paletas.
 */
function pickGradient(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // converte pra int32
  }
  const idx = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[idx];
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ringActive: {
    backgroundColor: colors.primary,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    backgroundColor: 'transparent',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '700',
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackItem: {
    borderWidth: 2,
    borderColor: colors.bg,
    borderRadius: 999,
  },
  stackMore: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackMoreText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
}), [themeVersion]);
}
