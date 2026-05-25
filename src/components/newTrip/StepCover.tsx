import * as ImagePicker from 'expo-image-picker';
import {useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Camera, Check } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useCoverSuggestions } from '@/hooks/useCoverPhoto';
import { uploadCoverPhoto } from '@/lib/coverUpload';
import { useTheme } from '@/components/ThemeProvider';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  title: string;
  coverUrl: string | null;
  userId: string;
  onChange: (url: string | null) => void;
};

/**
 * Step 4: escolha de cover photo.
 * - Sugestões automáticas baseadas no título da viagem
 * - Botão pra fazer upload custom da galeria
 * - Botão pra "pular" (sem cover, vai usar fallback automático na exibição)
 */
export function StepCover({ title, coverUrl, userId, onChange }: Props) {
  const styles = useStyles();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  // Busca sugestões do Pexels (com cache do Supabase)
  const { suggestions, loading: loadingSuggestions } = useCoverSuggestions(title);

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Precisamos de permissão pra acessar sua galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    const { publicUrl, error } = await uploadCoverPhoto(
      userId,
      asset.uri,
      asset.mimeType ?? 'image/jpeg'
    );
    setUploading(false);

    if (error || !publicUrl) {
      toast.error(error ?? 'Erro ao subir foto.');
      return;
    }
    onChange(publicUrl);
    toast.success('Foto enviada!');
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroRow}>
        <View style={styles.iconCircle}>
          <Camera size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Capa da viagem</Text>
          <Text style={styles.heroSubtitle}>
            Escolha uma foto sugerida ou faça upload da sua. Pode pular e mudar
            depois.
          </Text>
        </View>
      </View>

      {/* Preview maior da seleção atual */}
      {coverUrl && (
        <View style={styles.preview}>
          <Image source={{ uri: coverUrl }} style={styles.previewImage} />
          <View style={styles.previewBadge}>
            <Check size={14} color={colors.primaryTextOnSolid} />
            <Text style={styles.previewBadgeText}>Selecionada</Text>
          </View>
        </View>
      )}

      <Button
        title={uploading ? 'Enviando...' : 'Subir minha foto'}
        variant={coverUrl ? 'secondary' : 'primary'}
        onPress={handlePickPhoto}
        loading={uploading}
        leftIcon={<Camera size={16} color={coverUrl ? colors.text : colors.primaryTextOnSolid} />}
      />

      {/* Sugestões em grid 2 colunas */}
      <View>
        <Text style={styles.suggestionsLabel}>
          {title ? `Sugestões de fotos: ${title}` : 'Sugestões'}
        </Text>
        {loadingSuggestions ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Buscando fotos…</Text>
          </View>
        ) : suggestions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              Não encontramos fotos pra esse nome. Suba a sua acima.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {suggestions.map((url) => {
              const selected = url === coverUrl;
              return (
                <Pressable
                  key={url}
                  onPress={() => onChange(selected ? null : url)}
                  style={[styles.gridItem, selected && styles.gridItemSelected]}
                >
                  <Image source={{ uri: url }} style={styles.gridImage} />
                  {selected && (
                    <View style={styles.checkOverlay}>
                      <Check size={20} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  container: { paddingBottom: spacing.xxxl, gap: spacing.lg },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  preview: {
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: { width: '100%', height: '100%' },
  previewBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  previewBadgeText: {
    color: colors.primaryTextOnSolid,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  suggestionsLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  emptyBox: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    width: '48%',
    aspectRatio: 16 / 10,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  gridItemSelected: {
    borderColor: colors.primary,
  },
  gridImage: { width: '100%', height: '100%' },
  checkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 184, 166, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}), [themeVersion]);
}
