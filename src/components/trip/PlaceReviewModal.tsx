/**
 * PlaceReviewModal — aparece após a visita a um lugar do roteiro.
 * O usuário avalia com estrelas e escreve um comentário opcional.
 */
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Star, X } from '@/components/Icon';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useTheme } from '@/components/ThemeProvider';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import { usePlaceReviews } from '@/hooks/usePlaceReviews';

type Props = {
  visible: boolean;
  placeId: string;
  placeName: string;
  tripId?: string;
  visitedAt: string;   // ISO date string
  currentUserId: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function PlaceReviewModal({
  visible, placeId, placeName, tripId, visitedAt, currentUserId, onClose, onSubmitted,
}: Props) {
  const styles = useStyles();
  const toast = useToast();
  const { submitReview } = usePlaceReviews(placeId, currentUserId);

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (rating === 0) { toast.error('Selecione uma avaliação de 1 a 5 estrelas.'); return; }
    setSaving(true);
    const ok = await submitReview({
      place_id: placeId,
      place_name: placeName,
      trip_id: tripId,
      rating,
      title: title.trim() || undefined,
      body: body.trim() || undefined,
      visited_at: visitedAt,
    });
    setSaving(false);
    if (ok) {
      toast.success('Avaliação enviada! Outros viajantes vão agradecer.');
      onSubmitted?.();
      onClose();
      setRating(0); setTitle(''); setBody('');
    } else {
      toast.error('Erro ao salvar avaliação. Tente novamente.');
    }
  }

  const STAR_LABELS = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Como foi a visita?</Text>
                <Text style={styles.headerSub} numberOfLines={1}>{placeName}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Estrelas */}
              <View style={styles.starsSection}>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Pressable key={s} onPress={() => setRating(s)} hitSlop={6}>
                      <Star
                        size={40}
                        color={s <= rating ? '#f59e0b' : colors.border}
                      />
                    </Pressable>
                  ))}
                </View>
                {rating > 0 && (
                  <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
                )}
              </View>

              {/* Título */}
              <View style={styles.field}>
                <Text style={styles.label}>Título (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Resuma sua experiência em uma frase"
                  placeholderTextColor={colors.textMuted}
                  maxLength={80}
                  returnKeyType="next"
                />
              </View>

              {/* Corpo */}
              <View style={styles.field}>
                <Text style={styles.label}>Comentário (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Conte o que achou — dicas, pontos positivos e negativos..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{body.length}/1000</Text>
              </View>

              {/* Aviso de visibilidade */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  🌍 Sua avaliação ficará visível para outros viajantes do Trajet que planejarem visitar este lugar.
                </Text>
              </View>

              <Button
                title="Publicar avaliação"
                onPress={handleSubmit}
                loading={saving}
                style={styles.submitBtn}
              />

              <Button
                title="Agora não"
                variant="ghost"
                onPress={onClose}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </Modal>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderColor: colors.border,
    },
    headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    headerSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    content: { padding: spacing.lg, gap: spacing.lg },
    starsSection: { alignItems: 'center', paddingVertical: spacing.lg },
    starsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    ratingLabel: { fontSize: fontSize.md, fontWeight: '600', color: '#f59e0b' },
    field: { gap: spacing.xs },
    label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
    input: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      fontSize: fontSize.md, color: colors.text,
    },
    textarea: { minHeight: 96, paddingTop: spacing.sm },
    charCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right' },
    infoBox: {
      backgroundColor: colors.surface, borderRadius: radius.md,
      padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    },
    infoText: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
    submitBtn: { marginTop: spacing.xs },
  }), [themeVersion]);
}
