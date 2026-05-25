import {useState, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/lib/theme';
import { useTheme } from '@/components/ThemeProvider';

type Props = {
  /** ISO 3166-1 alpha-2 lowercase (br, us, eu, gb, ...) */
  country: string;
  /** Largura desejada (a altura mantém proporção 4:3 das bandeiras) */
  size?: number;
};

/**
 * Converte código de país de 2 letras (br, us, etc) em emoji de bandeira.
 * Usa Regional Indicator Symbols do Unicode.
 *
 * Caso especial: 'eu' não tem emoji oficial — usamos o fallback de imagem.
 */
function countryToEmoji(country: string): string | null {
  if (!country || country.length !== 2) return null;
  const upper = country.toUpperCase();

  // Regional Indicator Symbol = code point base 0x1F1E6 + offset da letra
  const offset = 0x1f1e6 - 0x41; // 'A' = 0x41
  const codePoints = [
    upper.charCodeAt(0) + offset,
    upper.charCodeAt(1) + offset,
  ];
  return String.fromCodePoint(...codePoints);
}

/**
 * Renderiza uma bandeira de país.
 *
 * Estratégia:
 * 1. Primeiro tenta usar **emoji nativo** do sistema (sem network, instantâneo).
 * 2. Se for 'eu' (não tem emoji oficial) OU emoji falha em render,
 *    usa imagem do flagcdn.com como fallback.
 * 3. Se a imagem também falha, mostra caixa cinza.
 */
export function Flag({ country, size = 24 }: Props) {
  const styles = useStyles();
  const emoji = countryToEmoji(country);
  const [imageFailed, setImageFailed] = useState(false);

  const height = (size * 3) / 4; // 4:3 ratio

  // Emoji renderiza super bem em iOS/Android, sem precisar de net
  if (emoji) {
    // Emoji size: aproximadamente o size pedido (font scaling)
    return (
      <View
        style={[
          styles.emojiWrap,
          { width: size + 4, height: height + 2 },
        ]}
      >
        <Text style={{ fontSize: size }}>{emoji}</Text>
      </View>
    );
  }

  // Fallback: flagcdn
  if (!imageFailed) {
    const cdnSize =
      size <= 16 ? 32 : size <= 20 ? 40 : size <= 32 ? 64 : 80;
    const url = `https://flagcdn.com/w${cdnSize}/${country}.png`;

    return (
      <View
        style={[
          styles.wrap,
          { width: size, height, borderRadius: radius.sm },
        ]}
      >
        <Image
          source={{ uri: url }}
          style={[styles.img, { width: size, height }]}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      </View>
    );
  }

  // Último fallback: mostra código do país em caixa estilizada
  return (
    <View
      style={[
        styles.wrap,
        styles.fallbackBox,
        { width: size, height, borderRadius: radius.sm },
      ]}
    >
      <Text style={{ fontSize: size * 0.35, color: colors.textMuted, fontWeight: '700' }}>
        {country.toUpperCase()}
      </Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  emojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
}), [themeVersion]);
}
