import { useLocalSearchParams, useRouter } from 'expo-router';
import {useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useToast } from '@/components/Toast';
import { TravelChecklistModal } from '@/components/TravelChecklistModal';
import { useAuth } from '@/hooks/useAuth';
import { datesBetween, toDbDate } from '@/lib/dates';
import { detectLocalCurrency } from '@/lib/expenses';
import { callOpenAI } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

import { StepCover } from '@/components/newTrip/StepCover';
import { StepCompanions } from '@/components/newTrip/StepCompanions';
import { StepTransport, type TransportModeConfig } from '@/components/newTrip/StepTransport';
import { StepDates } from '@/components/newTrip/StepDates';
import { StepDestination } from '@/components/newTrip/StepDestination';
import { StepFeatures } from '@/components/newTrip/StepFeatures';
import { StepHeader } from '@/components/newTrip/StepHeader';

export type WizardData = {
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  features: {
    itinerary: boolean;
    lodging: boolean;
    places: boolean;
    expenses: boolean;
    tasks: boolean;
    transports: boolean;
    documents: boolean;
  };
  coverUrl: string | null;
};

const TOTAL_STEPS = 6;

export default function NewTripScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  // Params vindos do planejador financeiro (opcional)
  const params = useLocalSearchParams<{
    title?: string;
    days?: string;
    currency?: string;
    description?: string;
    fromPlanner?: string;
    estimateItems?: string;
    monthlyGoal?: string;
    savedAmount?: string;
  }>();

  const fromPlanner = params.fromPlanner === 'true';

  const [step, setStep] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  async function getAISuggestion() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const response = await callOpenAI({
        messages: [{
          role: 'user',
          content: `Quero planejar uma viagem. ${aiPrompt}\n\nMe dê sugestões objetivas em português: destino ideal, época do ano, duração recomendada, 3 pontos turísticos imperdíveis, custo médio estimado por pessoa. Seja direto e prático — máximo 5 linhas.`,
        }],
        temperature: 0.7,
        max_tokens: 400,
      });
      setAiSuggestion(response);
    } catch {
      setAiSuggestion('Não foi possível obter sugestões no momento.');
    } finally {
      setAiLoading(false);
    }
  }
  const [loading, setLoading] = useState(false);
  const [checklistTripId, setChecklistTripId] = useState<string | null>(null);
  const [invitedFriendIds, setInvitedFriendIds] = useState<string[]>([]);
  const [transportConfig, setTransportConfig] = useState<TransportModeConfig>({
    modes: ['flight'],
    primaryMode: 'flight',
  });
  const [data, setData] = useState<WizardData>(() => {
    // Pré-preenche com dados do planejador se vierem
    const prefillTitle = params.title ?? '';
    const prefillCurrency = params.currency ?? detectLocalCurrency();

    // Se vierem dias do planejador, calcula end_date como startDate + dias a partir de hoje
    let startDate: string | null = null;
    let endDate: string | null = null;
    if (params.days) {
      const days = parseInt(params.days, 10);
      if (!isNaN(days) && days > 0) {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + days - 1);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
      }
    }

    return {
      title: prefillTitle,
      description: params.description ?? '',
      startDate,
      endDate,
      baseCurrency: prefillCurrency,
      features: { itinerary: true, lodging: true, places: true, expenses: true, tasks: true, transports: true, documents: true },
      coverUrl: null,
    };
  });

  function update(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }
  function updateFeature(key: keyof WizardData['features'], value: boolean) {
    setData((prev) => ({ ...prev, features: { ...prev.features, [key]: value } }));
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else handleCreate();
  }
  function back() {
    if (step > 0) setStep(step - 1);
    else router.back();
  }

  async function handleCreate() {
    if (!user) {
      toast.error('Sessão expirada, faça login de novo.');
      return;
    }
    setLoading(true);

    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        owner_id: user.id,
        title: data.title.trim(),
        description: data.description.trim() || null,
        start_date: data.startDate,
        end_date: data.endDate,
        base_currency: data.baseCurrency,
        cover_image_url: data.coverUrl,
        feature_itinerary: data.features.itinerary,
        feature_transports: data.features.transports !== false,
        feature_documents: data.features.documents !== false,
        feature_lodging: data.features.lodging,
        feature_places: data.features.places,
        feature_expenses: data.features.expenses,
        feature_tasks: data.features.tasks,
      })
      .select()
      .single();

    if (error || !trip) {
      setLoading(false);
      toast.error(error?.message ?? 'Erro ao criar viagem.');
      return;
    }

    if (data.startDate && data.endDate) {
      const days = datesBetween(data.startDate, data.endDate).map((d, i) => ({
        trip_id: trip.id,
        day_date: d,
        position: i,
      }));
      await supabase.from('trip_days').insert(days);
    }

    // Se veio do planner com estimativas, cria despesas pré-populadas
    if (params.fromPlanner === 'true' && params.estimateItems && user) {
      try {
        const items = JSON.parse(params.estimateItems) as { key: string; label: string; value: number }[];
        const categoryMap: Record<string, string> = {
          flight: 'transport',
          hotel: 'accommodation',
          food: 'food',
          transport: 'transport',
          activities: 'activities',
          misc: 'other',
        };
        const expenses = items
          .filter((it) => it.value > 0)
          .map((it) => ({
            trip_id: trip.id,
            paid_by: user.id,
            amount: it.value,
            currency: data.baseCurrency,
            amount_in_base: it.value,
            exchange_rate: 1,
            description: `${it.label} (estimativa)`,
            category: categoryMap[it.key] ?? 'other',
            expense_date: data.startDate ?? toDbDate(new Date()),
          }));
        if (expenses.length > 0) {
          await supabase.from('expenses').insert(expenses);
        }
      } catch { /* silencioso */ }
    }

    setLoading(false);
    toast.success('Viagem criada!');

    // Salva dados de rota de carro se configurado
    if (transportConfig.modes.includes('car') && transportConfig.totalKm) {
      try {
        await (supabase as any).from('trip_route').insert({
          trip_id: trip.id,
          total_km: parseFloat(transportConfig.totalKm),
          fuel_efficiency: transportConfig.fuelEfficiency ? parseFloat(transportConfig.fuelEfficiency) : null,
          fuel_price_per_liter: transportConfig.fuelPricePerLiter ? parseFloat(transportConfig.fuelPricePerLiter) : null,
          estimated_toll_cost: transportConfig.estimatedTollCost ? parseFloat(transportConfig.estimatedTollCost) : null,
        });
      } catch { /* silencioso */ }
    }

    // Cria convites para amigos selecionados
    if (invitedFriendIds.length > 0) {
      try {
        const { createInvite } = await import('@/lib/invites');
        const { token } = await createInvite({ tripId: trip.id, role: 'editor' }, user.id);
        if (token) {
          // Adiciona amigos diretamente como membros (mais rápido do que link)
          const memberInserts = invitedFriendIds.map(profileId => ({
            trip_id: trip.id,
            profile_id: profileId,
            role: 'editor',
          }));
          await supabase.from('trip_members').insert(memberInserts as any);
          toast.success(`${invitedFriendIds.length} amigo${invitedFriendIds.length > 1 ? 's' : ''} adicionado${invitedFriendIds.length > 1 ? 's' : ''} à viagem!`);
        }
      } catch { /* silencioso */ }
    }

    // Se tasks está ativo, abre checklist de IA antes de navegar
    if (data.features.tasks) {
      setChecklistTripId(trip.id);
    } else {
      router.replace(`/(app)/trip/${trip.id}`);
    }
  }

  // Validação por step pra desabilitar "Próximo"
  const canAdvance = (() => {
    switch (step) {
      case 0:
        return data.title.trim().length >= 2;
      case 1:
        return true; // datas opcionais
      case 2:
        return Object.values(data.features).some((v) => v); // pelo menos 1
      case 3:
        return transportConfig.modes.length > 0;
      case 4:
        return true; // companions
      case 5:
        return true; // cover
      default:
        return false;
    }
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <StepHeader
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          onBack={back}
          onNext={next}
          canAdvance={canAdvance}
          loading={loading}
          isLast={step === TOTAL_STEPS - 1}
        />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {fromPlanner && step === 0 && (
            <View style={styles.plannerBanner}>
              <Text style={styles.plannerBannerIcon}>💰</Text>
              <Text style={styles.plannerBannerText}>
                Importado do planejador financeiro. Confirme o destino e ajuste o que quiser.
              </Text>
            </View>
          )}
          <StepFader key={step} step={step}>
            {step === 0 && (
              <>
                <StepDestination
                  title={data.title}
                  description={data.description}
                  onChange={(patch) => update(patch)}
                />

                {/* Botão flutuante de IA — canto inferior direito */}
                <Pressable
                  onPress={() => setAiModalOpen(true)}
                  style={styles.aiFloatBtn}
                >
                  <Text style={styles.aiFloatIcon}>✦</Text>
                  <Text style={styles.aiFloatText}>Não sabe pra onde viajar?</Text>
                </Pressable>
              </>
            )}
            {step === 1 && (
              <StepDates
                startDate={data.startDate}
                endDate={data.endDate}
                baseCurrency={data.baseCurrency}
                onChange={(patch) => update(patch)}
              />
            )}
            {step === 2 && (
              <StepFeatures
                features={data.features}
                onToggle={updateFeature}
              />
            )}
            {step === 3 && (
              <StepTransport
                value={transportConfig}
                onChange={setTransportConfig}
              />
            )}
            {step === 4 && (
              <StepCompanions
                selectedIds={invitedFriendIds}
                onChange={setInvitedFriendIds}
              />
            )}
            {step === 5 && (
              <StepCover
                title={data.title}
                coverUrl={data.coverUrl}
                userId={user?.id ?? ''}
                onChange={(url) => update({ coverUrl: url })}
              />
            )}
          </StepFader>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de sugestão de destino com IA */}
      <Modal
        visible={aiModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setAiModalOpen(false); setAiSuggestion(null); setAiPrompt(''); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <View style={styles.aiModalHeader}>
            <View>
              <Text style={styles.aiModalTitle}>✦ Sugerir destino</Text>
              <Text style={styles.aiModalSub}>Descreva o tipo de viagem que você quer. A IA sugere destinos, época ideal, duração e o que fazer.</Text>
            </View>
            <Pressable onPress={() => { setAiModalOpen(false); setAiSuggestion(null); setAiPrompt(''); }} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 22 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={styles.aiModalLabel}>Descreva o que você procura</Text>
            <TextInput
              style={styles.aiModalInput}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder="Ex: praia tranquila e barata na América do Sul em julho com minha namorada..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              autoFocus
              returnKeyType="done"
              blurOnSubmit
            />
            <Text style={styles.aiModalHint}>
              Dicas: informe o mês, estilo (aventura, relaxar, cultural), orçamento e quem vai. Quanto mais detalhes, melhor a sugestão.
            </Text>
            <Pressable
              onPress={getAISuggestion}
              disabled={aiLoading || !aiPrompt.trim()}
              style={[styles.aiBtn, (aiLoading || !aiPrompt.trim()) && styles.aiBtnDisabled]}
            >
              {aiLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.aiBtnText}>Gerar sugestão</Text>
              }
            </Pressable>
            {aiSuggestion && (
              <View style={styles.aiResult}>
                <Text style={[styles.aiModalLabel, { marginBottom: spacing.sm }]}>Sugestão da IA</Text>
                <Text style={styles.aiResultText}>{aiSuggestion}</Text>
                <Pressable
                  onPress={() => { setAiModalOpen(false); setAiSuggestion(null); }}
                  style={[styles.aiBtn, { marginTop: spacing.md, backgroundColor: colors.success ?? colors.primary }]}
                >
                  <Text style={styles.aiBtnText}>Fechar e preencher manualmente</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {checklistTripId && (
        <TravelChecklistModal
          visible={!!checklistTripId}
          tripId={checklistTripId}
          destination={data.title}
          startDate={data.startDate}
          daysCount={data.startDate && data.endDate
            ? Math.ceil((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 86400000) + 1
            : 7}
          onFinish={() => {
            router.replace(`/(app)/trip/${checklistTripId}`);
            setChecklistTripId(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Wrapper que faz fade entre steps. Como o pai usa key={step}, o componente
 * re-monta a cada troca — basta animar de "entrada" e pronto.
 */
function StepFader({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  // Inicia em 0, anima pra 1 quando monta. Re-monta a cada step (key abaixo).
  const opacity = useSharedValue(0);
  const offset = useSharedValue(12);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    offset.value = withTiming(0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }],
  }));

  return (
    <Animated.View key={step} style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl * 2 },
  plannerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySofter,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    padding: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  plannerBannerIcon: { fontSize: 16 },
  plannerBannerText: {
    flex: 1,
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    lineHeight: 18,
  },
  aiBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiBoxTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  aiFloatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(123,47,255,0.35)',
    backgroundColor: 'rgba(123,47,255,0.07)',
  },
  aiFloatIcon: {
    fontSize: 12,
    color: '#7b2fff',
  },
  aiFloatText: {
    fontSize: fontSize.xs,
    color: '#7b2fff',
    fontWeight: '600',
  },
  aiModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  aiModalTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  aiModalSub: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    maxWidth: 260,
  },
  aiModalLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  aiModalInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.sm,
    minHeight: 100,
    textAlignVertical: 'top' as any,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  aiModalHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  aiInput: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: spacing.sm,
    color: colors.text,
    fontSize: fontSize.sm,
    minHeight: 72,
    textAlignVertical: 'top' as any,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center' as any,
  },
  aiBtnDisabled: { opacity: 0.5 },
  aiBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  aiResult: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  aiResultText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
}), [themeVersion]);
}
