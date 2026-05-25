import { Stack, useRouter } from 'expo-router';
import {useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
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

import { AnimatedPress } from '@/components/AnimatedPress';
import { Button } from '@/components/Button';
import { useAIConsent } from '@/components/AIConsentModal';
import { ChevronRight } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { createReminder } from '@/lib/userReminders';
import { detectLocalCurrency } from '@/lib/expenses';
import {
  compareTwoDestinations,
  computeFeasibility,
  deletePlan,
  feasibilityLabel,
  fetchExchangeRates,
  generateTripPlanEstimate,
  listCheckins,
  listMyPlans,
  loadFinancialProfile,
  saveFinancialProfile,
  saveTripPlan,
  TRAVEL_STYLE_DESCRIPTIONS,
  TRAVEL_STYLE_LABELS,
  type PlanCategoryItem,
  type SavingsScenario,
  type TravelStyle,
  type TripPlanEstimate,
  type TripPlanInput,
  type TripPlanCheckin,
} from '@/lib/tripPlanner';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  shadow,
  spacing,
} from '@/lib/theme';

type Stage = 'destination' | 'duration' | 'style' | 'budget' | 'result' | 'compare' | 'history';

const QUICK_DAYS = [7, 10, 14, 21, 30];
const QUICK_TRAVELERS = [1, 2, 3, 4];
const STYLE_ICONS: Record<TravelStyle, string> = { budget: '🌱', moderate: '⚖️', comfort: '✨' };

const LOADING_STEPS = [
  { text: 'Pesquisando passagens aéreas... ✈️', ms: 0 },
  { text: 'Estimando hospedagem... 🏨', ms: 3000 },
  { text: 'Calculando alimentação e passeios... 🍽️', ms: 6000 },
  { text: 'Consultando câmbio e seguro... 💱', ms: 9000 },
  { text: 'Montando seu plano financeiro... 📊', ms: 12000 },
];

// ─────────────────────────────────────────────────────────────────
export default function TripPlannerScreen() {
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { requestConsent, consentModal } = useAIConsent();
  const scrollRef = useRef<ScrollView>(null);

  // inputs
  const [destination, setDestination] = useState('');
  const [compareDestB, setCompareDestB] = useState('');
  const [daysCount, setDaysCount] = useState(10);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>('moderate');
  const [travelersCount, setTravelersCount] = useState(1);
  const [budgetSaved, setBudgetSaved] = useState('');
  const [budgetMonthly, setBudgetMonthly] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [exchangeUSDText, setExchangeUSDText] = useState('');
  const [exchangeEURText, setExchangeEURText] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(true);
  const [exchangeEdited, setExchangeEdited] = useState(false);

  // stage
  const [stage, setStage] = useState<Stage>('destination');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [estimate, setEstimate] = useState<TripPlanEstimate | null>(null);
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  // history
  const [history, setHistory] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<TripPlanCheckin[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  const currency = detectLocalCurrency();
  const stageOrder: Stage[] = ['destination', 'duration', 'style', 'budget', 'result'];
  const currentIdx = stageOrder.indexOf(stage);
  const progress = stage === 'result' ? 100
    : stage === 'compare' || stage === 'history' ? 100
    : ((currentIdx + 1) / stageOrder.length) * 100;

  // Carrega câmbio e perfil ao montar
  useEffect(() => {
    setExchangeLoading(true);
    fetchExchangeRates().then(({ usd, eur }) => {
      // Usa valor da API se retornou, senão usa estimativa conservadora
      setExchangeUSDText((usd ?? 5.90).toFixed(2));
      setExchangeEURText((eur ?? 6.20).toFixed(2));
      setExchangeLoading(false);
    }).catch(() => {
      // Fallback se API falhar
      setExchangeUSDText('5.90');
      setExchangeEURText('6.20');
      setExchangeLoading(false);
    });
    loadFinancialProfile().then((p) => {
      if (p.defaultMonthlySavings) setBudgetMonthly(String(p.defaultMonthlySavings));
    });
  }, []);

  // Animação de loading steps
  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    let step = 0;
    const timers = LOADING_STEPS.slice(1).map((s, i) =>
      setTimeout(() => setLoadingStep(i + 1), s.ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  function goNext(s: Stage) {
    setStage(s);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  }

  function back() {
    if (stage === 'result' || stage === 'compare' || stage === 'history') {
      goNext('budget');
    } else if (stage === 'destination') {
      router.back();
    } else {
      goNext(stageOrder[Math.max(0, currentIdx - 1)]);
    }
  }

  async function handleGenerate() {
    const saved = parseFloat(budgetSaved.replace(',', '.')) || 0;
    const monthly = parseFloat(budgetMonthly.replace(',', '.')) || 0;

    const input: TripPlanInput = {
      destination,
      daysCount,
      travelStyle,
      travelersCount,
      budgetSaved: saved,
      budgetMonthly: monthly,
      currency,
      exchangeRateUSD: parseFloat(exchangeUSDText) || undefined,
      exchangeRateEUR: parseFloat(exchangeEURText) || undefined,
    };

    setLoading(true);
    goNext('result');

    try {
      if (compareMode && compareDestB.trim().length >= 2) {
        const result = await compareTwoDestinations(
          { ...input, destination: '' } as any,
          destination,
          compareDestB.trim(),
        );
        setCompareResult(result);
        const id = await saveTripPlan({ ...input, destination }, result.a.estimate);
        setPlanId(id);
      } else {
        const result = await generateTripPlanEstimate(input);
        setEstimate(result);
        const id = await saveTripPlan(input, result);
        setPlanId(id);
        // Salva perfil financeiro pra pré-preencher na próxima
        if (monthly > 0) saveFinancialProfile(monthly, currency).catch(() => {});
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao gerar estimativa.');
      goNext('budget');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadHistory() {
    const plans = await listMyPlans();
    setHistory(plans);
    setSelectedPlan(null);
    goNext('history');
  }

  function handleOpenPlan(plan: any) {
    // Carrega os dados do plano e mostra o resultado
    const est = plan.estimate_data as TripPlanEstimate;
    setEstimate(est);
    setDestination(plan.destination);
    setDaysCount(plan.days_count);
    setTravelStyle(plan.travel_style as TravelStyle);
    setTravelersCount(plan.travelers_count ?? 1);
    setBudgetSaved(String(plan.budget_saved ?? 0));
    setBudgetMonthly(String(plan.budget_monthly ?? 0));
    setPlanId(plan.id);
    setSelectedPlan(plan);
    goNext('result');
  }

  function handleRecalculatePlan(plan: any) {
    // Carrega os parâmetros de volta no formulário
    setDestination(plan.destination);
    setDaysCount(plan.days_count);
    setTravelStyle(plan.travel_style as TravelStyle);
    setTravelersCount(plan.travelers_count ?? 1);
    setBudgetSaved(String(plan.budget_saved ?? 0));
    setBudgetMonthly(String(plan.budget_monthly ?? 0));
    goNext('budget');
  }

  async function handleDeletePlan(plan: any) {
    Alert.alert(
      'Deletar plano?',
      `${plan.destination} · ${plan.days_count} dias`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            await deletePlan(plan.id);
            setHistory((prev) => prev.filter((p) => p.id !== plan.id));
            toast.success('Plano deletado.');
          },
        },
      ],
    );
  }

  async function handleSetReminder() {
    if (!planId) return;
    const monthly = parseFloat(budgetMonthly.replace(',', '.')) || 0;
    const saved = parseFloat(budgetSaved.replace(',', '.')) || 0;
    const total = estimate?.total ?? 0;

    const nextMonth = new Date();
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setHours(9, 0, 0, 0);

    await createReminder({
      title: `Guardar ${currency} ${Math.round(monthly).toLocaleString('pt-BR')}/mês para ${destination}`,
      body: `Meta: ${currency} ${Math.round(total).toLocaleString('pt-BR')} | Já tem: ${currency} ${Math.round(saved).toLocaleString('pt-BR')}`,
      remindAt: nextMonth,
    });
    toast.success('Lembrete criado para o dia 1 do mês! 🎯');
  }

  function handleCreateTrip() {
    const total = estimate?.total ?? 0;
    const description = total > 0
      ? `Planejado para ${daysCount} dias — estimativa ${currency} ${Math.round(total).toLocaleString('pt-BR')}`
      : '';

    // Passa os itens estimados para criar despesas pré-populadas na viagem
    const estimateItems = estimate?.items
      ? JSON.stringify(estimate.items.map((it: any) => ({
          key: it.key,
          label: it.label,
          value: Math.round(it.value),
        })))
      : '';

    const params = new URLSearchParams({
      title: destination,
      days: String(daysCount),
      currency,
      fromPlanner: 'true',
      monthlyGoal: String(monthlyNum),
      savedAmount: String(savedNum),
      ...(description ? { description } : {}),
      ...(estimateItems ? { estimateItems } : {}),
    });
    router.replace(`/(app)/new-trip?${params.toString()}` as any);
  }

  const savedNum = parseFloat(budgetSaved.replace(',', '.')) || 0;
  const monthlyNum = parseFloat(budgetMonthly.replace(',', '.')) || 0;

  // ─── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: stage === 'history' ? 'Meus planos'
               : stage === 'result' ? 'Seu plano de viagem'
               : stage === 'compare' ? 'Comparar destinos'
               : 'Planejador financeiro',
          headerRight: stage !== 'history' && stage !== 'result' && stage !== 'compare'
            ? () => (
                <Pressable onPress={handleLoadHistory} hitSlop={8} >
                  <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
                    Meus planos
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      {/* Barra de progresso — discreta, abaixo do header nativo */}
      {stage !== 'history' && stage !== 'result' && (
        <View style={styles.progressBarWrap}>
          <ProgressBar value={progress} />
          <Text style={styles.progressStepLabel}>
            {stage === 'destination' ? 'Destino' :
             stage === 'duration' ? 'Duração' :
             stage === 'style' ? 'Estilo' : 'Orçamento'}
            {' '}({currentIdx + 1}/{stageOrder.length - 1})
          </Text>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── HISTÓRICO ── */}
          {stage === 'history' && (
            <StageFade>
              <Text style={styles.stageTitle}>Meus planos</Text>
              <Text style={styles.stageHint}>
                {history.length} {history.length === 1 ? 'plano salvo' : 'planos salvos'}
              </Text>

              {history.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    Nenhum plano salvo ainda.{'\n'}
                    Crie seu primeiro planejamento!
                  </Text>
                </View>
              ) : (
                history.map((plan) => (
                  <HistoryCard
                    key={plan.id}
                    plan={plan}
                    currency={currency}
                    onOpen={() => handleOpenPlan(plan)}
                    onRecalculate={() => handleRecalculatePlan(plan)}
                    onDelete={() => handleDeletePlan(plan)}
                  />
                ))
              )}

              <Button
                title="Novo planejamento"
                variant="primary"
                onPress={() => goNext('destination')}
                fullWidth
                style={{ marginTop: spacing.md }}
              />
            </StageFade>
          )}

          {/* ── ETAPA 1: DESTINO ── */}
          {stage === 'destination' && (
            <StageFade>
              <Text style={styles.stageEmoji}>🌍</Text>
              <Text style={styles.stageTitle}>Pra onde você quer ir?</Text>
              <Text style={styles.stageHint}>Pode ser uma cidade, país ou região</Text>

              <TextInput
                value={destination}
                onChangeText={setDestination}
                placeholder="Ex: Lisboa, Portugal..."
                placeholderTextColor={colors.textMuted}
                style={styles.bigInput}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => { if (destination.trim().length >= 2) goNext('duration'); }}
              />

              {/* Modo comparação */}
              <Pressable
                onPress={() => setCompareMode((v) => !v)}
                style={[styles.compareToggle, compareMode && styles.compareToggleActive]}
              >
                <Text style={styles.compareToggleIcon}>⚖️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.compareToggleLabel, compareMode && { color: colors.primary }]}>
                    Comparar com outro destino
                  </Text>
                  <Text style={styles.compareToggleHint}>
                    Veja qual viagem cabe melhor no seu orçamento
                  </Text>
                </View>
                <View style={[styles.checkBox, compareMode && styles.checkBoxActive]}>
                  {compareMode && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </Pressable>

              {compareMode && (
                <TextInput
                  value={compareDestB}
                  onChangeText={setCompareDestB}
                  placeholder="Segundo destino (Ex: Roma, Itália...)"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.bigInput, { marginTop: spacing.sm }]}
                />
              )}

              <Text style={styles.suggestLabel}>Destinos populares</Text>
              <View style={styles.suggestRow}>
                {['Lisboa 🇵🇹','Roma 🇮🇹','Paris 🇫🇷','Buenos Aires 🇦🇷','Miami 🇺🇸','Japão 🇯🇵','Cancún 🇲🇽','Amsterdam 🇳🇱'].map((d) => {
                  const name = d.split(' ')[0];
                  return (
                    <Pressable key={d} onPress={() => setDestination(name)}
                      style={[styles.suggestChip, destination === name && styles.suggestChipActive]}>
                      <Text style={[styles.suggestChipText, destination === name && { color: colors.primary }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Button title="Próximo" variant="primary"
                disabled={destination.trim().length < 2 || (compareMode && compareDestB.trim().length < 2)}
                onPress={() => goNext('duration')}
                leftIcon={<ChevronRight size={16} color={colors.primaryTextOnSolid} />}
                fullWidth style={{ marginTop: spacing.xl }} />
            </StageFade>
          )}

          {/* ── ETAPA 2: DURAÇÃO ── */}
          {stage === 'duration' && (
            <StageFade>
              <Text style={styles.stageEmoji}>📅</Text>
              <Text style={styles.stageTitle}>Por quantos dias?</Text>
              <Text style={styles.stageHint}>Escolha ou ajuste manualmente</Text>

              <View style={styles.daysRow}>
                {QUICK_DAYS.map((d) => (
                  <Pressable key={d} onPress={() => setDaysCount(d)}
                    style={[styles.dayChip, daysCount === d && styles.dayChipActive]}>
                    <Text style={[styles.dayNum, daysCount === d && styles.dayNumActive]}>{d}</Text>
                    <Text style={[styles.dayLabel, daysCount === d && { color: colors.primary }]}>dias</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.customDaysRow}>
                <Text style={styles.customDaysLabel}>Outro número:</Text>
                <TextInput
                  value={String(daysCount)}
                  onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0 && n <= 90) setDaysCount(n); }}
                  keyboardType="number-pad" style={styles.customDaysInput} maxLength={2} />
                <Text style={styles.customDaysUnit}>dias</Text>
              </View>

              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Quantas pessoas vão?</Text>
              <View style={styles.travelersRow}>
                {QUICK_TRAVELERS.map((n) => (
                  <Pressable key={n} onPress={() => setTravelersCount(n)}
                    style={[styles.travelerChip, travelersCount === n && styles.travelerChipActive]}>
                    <Text style={styles.travelerEmoji}>{n === 1 ? '🧍' : n === 2 ? '👫' : n === 3 ? '👨‍👩‍👦' : '👨‍👩‍👧‍👦'}</Text>
                    <Text style={[styles.travelerLabel, travelersCount === n && { color: colors.primary, fontWeight: '700' }]}>
                      {n === 1 ? 'Sozinho' : n === 2 ? 'Dupla' : n === 3 ? 'Trio' : `${n} pessoas`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button title="Próximo" variant="primary" onPress={() => goNext('style')}
                leftIcon={<ChevronRight size={16} color={colors.primaryTextOnSolid} />}
                fullWidth style={{ marginTop: spacing.xl }} />
            </StageFade>
          )}

          {/* ── ETAPA 3: ESTILO ── */}
          {stage === 'style' && (
            <StageFade>
              <Text style={styles.stageEmoji}>🎒</Text>
              <Text style={styles.stageTitle}>Como você curte viajar?</Text>
              <Text style={styles.stageHint}>Isso define os valores estimados</Text>

              <View style={styles.styleList}>
                {(['budget', 'moderate', 'comfort'] as TravelStyle[]).map((s) => (
                  <Pressable key={s} onPress={() => setTravelStyle(s)}
                    style={[styles.styleCard, travelStyle === s && styles.styleCardActive]}>
                    <Text style={styles.styleIcon}>{STYLE_ICONS[s]}</Text>
                    <View style={styles.styleText}>
                      <Text style={[styles.styleTitle, travelStyle === s && { color: colors.primary }]}>
                        {TRAVEL_STYLE_LABELS[s].split(' ').slice(1).join(' ')}
                      </Text>
                      <Text style={styles.styleDesc}>{TRAVEL_STYLE_DESCRIPTIONS[s]}</Text>
                    </View>
                    <View style={[styles.styleRadio, travelStyle === s && styles.styleRadioActive]}>
                      {travelStyle === s && <View style={styles.styleRadioDot} />}
                    </View>
                  </Pressable>
                ))}
              </View>

              <Button title="Próximo" variant="primary" onPress={() => goNext('budget')}
                leftIcon={<ChevronRight size={16} color={colors.primaryTextOnSolid} />}
                fullWidth style={{ marginTop: spacing.xl }} />
            </StageFade>
          )}

          {/* ── ETAPA 4: ORÇAMENTO ── */}
          {stage === 'budget' && (
            <StageFade>
              <Text style={styles.stageEmoji}>💰</Text>
              <Text style={styles.stageTitle}>Sua situação financeira</Text>
              <Text style={styles.stageHint}>Não precisa ser exato — uma estimativa já ajuda</Text>

              {/* Câmbio atual */}
              <View style={styles.exchangeBox}>
                <View style={styles.exchangeHeader}>
                  <Text style={styles.exchangeTitle}>💱 Câmbio atual</Text>
                  {exchangeLoading && <ActivityIndicator size="small" color={colors.primary} />}
                  {!exchangeLoading && (
                    <Text style={styles.exchangeAuto}>
                      {exchangeEdited ? '✏️ editado' : '🔄 automático'}
                    </Text>
                  )}
                </View>
                <View style={styles.exchangeRow}>
                  <View style={styles.exchangeItem}>
                    <Text style={styles.exchangeFlag}>🇺🇸 USD</Text>
                    <View style={styles.exchangeInputRow}>
                      <Text style={styles.exchangePrefix}>R$</Text>
                      <TextInput
                        value={exchangeUSDText}
                        onChangeText={(v) => { setExchangeUSDText(v); setExchangeEdited(true); }}
                        keyboardType="decimal-pad"
                        placeholder={exchangeLoading ? 'buscando...' : '5.90'}
                        placeholderTextColor={colors.textMuted}
                        style={styles.exchangeInput}
                      />
                    </View>
                  </View>
                  <View style={styles.exchangeItem}>
                    <Text style={styles.exchangeFlag}>🇪🇺 EUR</Text>
                    <View style={styles.exchangeInputRow}>
                      <Text style={styles.exchangePrefix}>R$</Text>
                      <TextInput
                        value={exchangeEURText}
                        onChangeText={(v) => { setExchangeEURText(v); setExchangeEdited(true); }}
                        keyboardType="decimal-pad"
                        placeholder={exchangeLoading ? 'buscando...' : '6.20'}
                        placeholderTextColor={colors.textMuted}
                        style={styles.exchangeInput}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.budgetSection}>
                <Text style={styles.sectionLabel}>Já guardou pra essa viagem</Text>
                <View style={styles.budgetInputRow}>
                  <Text style={styles.currencySymbol}>{currency}</Text>
                  <TextInput value={budgetSaved} onChangeText={setBudgetSaved}
                    placeholder="0" placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad" style={styles.budgetInput} />
                </View>
              </View>

              <View style={styles.budgetSection}>
                <Text style={styles.sectionLabel}>Consegue guardar por mês</Text>
                <View style={styles.budgetInputRow}>
                  <Text style={styles.currencySymbol}>{currency}</Text>
                  <TextInput value={budgetMonthly} onChangeText={setBudgetMonthly}
                    placeholder="0" placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad" style={styles.budgetInput} />
                </View>
                <Text style={styles.budgetHint}>
                  Mesmo que seja pouco — vamos mostrar em quanto tempo você chega lá
                </Text>
              </View>

              <View style={styles.summaryPreview}>
                <Text style={styles.summaryPreviewTitle}>Resumo do pedido</Text>
                <Text style={styles.summaryPreviewLine}>📍 {destination}{compareMode ? ` vs ${compareDestB}` : ''}</Text>
                <Text style={styles.summaryPreviewLine}>
                  📅 {daysCount} dias · {travelersCount === 1 ? 'sozinho' : `${travelersCount} pessoas`}
                </Text>
                <Text style={styles.summaryPreviewLine}>
                  {STYLE_ICONS[travelStyle]} {TRAVEL_STYLE_LABELS[travelStyle]}
                </Text>
              </View>

              <Button title="Calcular minha viagem ✨" variant="primary"
                onPress={() => requestConsent(handleGenerate)} fullWidth style={{ marginTop: spacing.lg }} />
            </StageFade>
          )}

          {/* ── RESULTADO ── */}
          {stage === 'result' && (
            <StageFade>
              {loading ? (
                <LoadingView destination={destination} step={loadingStep} />
              ) : compareResult ? (
                <CompareView
                  result={compareResult}
                  savedAmount={savedNum}
                  monthly={monthlyNum}
                  currency={currency}
                  onPickA={() => { setDestination(compareResult.a.destination); setEstimate(compareResult.a.estimate); setCompareResult(null); }}
                  onPickB={() => { setDestination(compareResult.b.destination); setEstimate(compareResult.b.estimate); setCompareResult(null); }}
                  onRecalculate={() => goNext('budget')}
                />
              ) : estimate ? (
                <ResultView
                  estimate={estimate}
                  destination={destination}
                  daysCount={daysCount}
                  travelersCount={travelersCount}
                  travelStyle={travelStyle}
                  savedAmount={savedNum}
                  monthly={monthlyNum}
                  currency={currency}
                  planId={planId}
                  onCreateTrip={handleCreateTrip}
                  onRecalculate={() => goNext('budget')}
                  onSetReminder={handleSetReminder}
                />
              ) : null}
            </StageFade>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {consentModal}
    </SafeAreaView>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: `${value}%` }]} />
    </View>
  );
}

function LoadingView({ destination, step }: { destination: string; step: number }) {
  const styles = useStyles();
  return (
    <View style={styles.loadingWrap}>
      <Text style={styles.loadingEmoji}>✈️</Text>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
      <Text style={styles.loadingTitle}>Calculando sua viagem...</Text>
      <Text style={styles.loadingStep}>{LOADING_STEPS[step]?.text ?? '...'}</Text>
      <Text style={styles.loadingHint}>Estimando custos reais de {destination}</Text>
    </View>
  );
}

function ResultView({
  estimate, destination, daysCount, travelersCount, travelStyle,
  savedAmount, monthly, currency, planId, onCreateTrip, onRecalculate, onSetReminder,
}: {
  estimate: TripPlanEstimate;
  destination: string;
  daysCount: number;
  travelersCount: number;
  travelStyle: TravelStyle;
  savedAmount: number;
  monthly: number;
  currency: string;
  planId: string | null;
  onCreateTrip: () => void;
  onRecalculate: () => void;
  onSetReminder: () => void;
}) {
  const styles = useStyles();
  const missing = Math.max(0, estimate.total - savedAmount);
  const alreadyHasEnough = savedAmount >= estimate.total;
  const feasibilityPct = computeFeasibility(estimate.total, savedAmount, monthly);
  const feasibility = feasibilityLabel(feasibilityPct);

  function fmt(n: number) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  return (
    <View style={styles.resultWrap}>
      {/* Hero */}
      <View style={styles.resultHero}>
        <Text style={styles.resultHeroEmoji}>🎉</Text>
        <Text style={styles.resultHeroTitle}>{destination}</Text>
        <Text style={styles.resultHeroSub}>
          {daysCount} dias · {travelersCount === 1 ? 'sozinho' : `${travelersCount} pessoas`} · {TRAVEL_STYLE_LABELS[travelStyle]}
        </Text>
        <View style={styles.resultTotalBox}>
          <Text style={styles.resultTotalLabel}>Estimativa total</Text>
          <Text style={styles.resultTotalValue}>{currency} {fmt(estimate.total)}</Text>
        </View>
      </View>

      {/* Gauge de viabilidade (#10) */}
      <FeasibilityGauge pct={feasibilityPct} feasibility={feasibility} />

      {/* Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Onde vai o seu dinheiro</Text>
        {estimate.items.map((item) => (
          <CategoryRow key={item.key} item={item} total={estimate.total} currency={currency} fmt={fmt} />
        ))}
      </View>

      {/* Status orçamento */}
      <View style={[styles.section, alreadyHasEnough ? styles.sectionSuccess : styles.sectionWarning]}>
        {alreadyHasEnough ? (
          <>
            <Text style={styles.budgetStatusEmoji}>🥳</Text>
            <Text style={styles.budgetStatusTitle}>Você já tem o suficiente!</Text>
            <Text style={styles.budgetStatusDesc}>
              Você tem {currency} {fmt(savedAmount)} e vai sobrar {currency} {fmt(savedAmount - estimate.total)}.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.budgetStatusEmoji}>💪</Text>
            <Text style={styles.budgetStatusTitle}>Faltam {currency} {fmt(missing)}</Text>
            <Text style={styles.budgetStatusDesc}>
              Você já tem {currency} {fmt(savedAmount)}. Com disciplina você chega lá!
            </Text>
          </>
        )}
      </View>

      {/* Simulador interativo de meta (#3) */}
      {!alreadyHasEnough && (
        <SavingsSimulator
          missing={missing}
          defaultMonthly={monthly}
          currency={currency}
          onSetReminder={onSetReminder}
        />
      )}

      {/* Dicas contextuais (#8) */}
      {estimate.tips && estimate.tips.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Dicas para economizar</Text>
          {estimate.tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipEmoji}>{tip.emoji}</Text>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Mensagem IA */}
      {estimate.feasibility_message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageIcon}>💬</Text>
          <Text style={styles.messageText}>{estimate.feasibility_message}</Text>
        </View>
      )}

      {/* CTAs */}
      <View style={styles.ctaStack}>
        <Button title="Criar viagem com esse destino ✈️" variant="primary"
          onPress={onCreateTrip} fullWidth />
        <Button title="💰 Ver plano de poupança" variant="secondary"
          onPress={onSetReminder} fullWidth />
        <Button title="Recalcular com outros valores" variant="ghost"
          onPress={onRecalculate} fullWidth />
      </View>

      <Text style={styles.disclaimer}>
        * Estimativas baseadas em médias de mercado. Valores podem variar conforme sazonalidade, câmbio e disponibilidade.
      </Text>
    </View>
  );
}

// Gauge de viabilidade — medidor visual (#10)
function FeasibilityGauge({
  pct,
  feasibility,
}: {
  pct: number;
  feasibility: ReturnType<typeof feasibilityLabel>;
}) {
  const styles = useStyles();
  const WIDTH = Dimensions.get('window').width - spacing.xl * 2 - spacing.lg * 2 - 2;

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeTitle}>Viabilidade</Text>
        <View style={[styles.gaugeBadge, { backgroundColor: feasibility.color + '22', borderColor: feasibility.color + '44' }]}>
          <Text style={[styles.gaugeBadgeText, { color: feasibility.color }]}>
            {feasibility.emoji} {feasibility.label}
          </Text>
        </View>
      </View>

      {/* Barra gradiente */}
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${pct}%`, backgroundColor: feasibility.color }]} />
        {/* Linha marcadora */}
        <View style={[styles.gaugeMarker, { left: `${pct}%` as any }]} />
      </View>

      <View style={styles.gaugeLabels}>
        <Text style={styles.gaugeLabelL}>Longo prazo</Text>
        <Text style={[styles.gaugePct, { color: feasibility.color }]}>{pct}%</Text>
        <Text style={styles.gaugeLabelR}>Já consigo!</Text>
      </View>
    </View>
  );
}

// Simulador interativo de poupança (#3)
function SavingsSimulator({
  missing,
  defaultMonthly,
  currency,
  onSetReminder,
}: {
  missing: number;
  defaultMonthly: number;
  currency: string;
  onSetReminder: () => void;
}) {
  const styles = useStyles();
  const [monthlyText, setMonthlyText] = useState(
    String(defaultMonthly > 0 ? Math.round(defaultMonthly) : 500)
  );

  const monthly = parseFloat(monthlyText.replace(',', '.')) || 0;
  const months = missing > 0 && monthly > 0 ? Math.ceil(missing / monthly) : 0;
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + months);
  const dateStr = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  function fmt(n: number) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>Em quanto tempo você consegue?</Text>
      <Text style={styles.simHint}>Digite o quanto consegue guardar por mês:</Text>

      {/* Input direto de valor */}
      <View style={styles.simInputRow}>
        <Text style={styles.simCurrencyLabel}>{currency}</Text>
        <TextInput
          value={monthlyText}
          onChangeText={setMonthlyText}
          keyboardType="decimal-pad"
          style={styles.simInput}
          placeholder="500"
          placeholderTextColor={colors.textMuted}
          selectTextOnFocus
        />
        <Text style={styles.simPerMonth}>/mês</Text>
      </View>

      {/* Atalhos rápidos */}
      <View style={styles.simQuickRow}>
        {[300, 500, 800, 1200, 2000].map((v) => (
          <Pressable
            key={v}
            onPress={() => setMonthlyText(String(v))}
            style={[
              styles.simQuickChip,
              Math.abs(monthly - v) < 1 && styles.simQuickChipActive,
            ]}
          >
            <Text style={[
              styles.simQuickLabel,
              Math.abs(monthly - v) < 1 && { color: colors.primary, fontWeight: '700' },
            ]}>
              {fmt(v)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Resultado dinâmico */}
      <View style={styles.simResult}>
        {monthly <= 0 ? (
          <Text style={styles.simResultDate}>Digite um valor acima ↑</Text>
        ) : months === 0 ? (
          <Text style={[styles.simResultMonths, { color: colors.success }]}>
            Você já pode ir! 🎉
          </Text>
        ) : (
          <>
            <View style={styles.simResultRow}>
              <Text style={styles.simResultMonths}>{months}</Text>
              <Text style={styles.simResultUnit}>
                {months === 1 ? 'mês' : 'meses'}
              </Text>
            </View>
            <Text style={styles.simResultDate}>
              🗓️ {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
            </Text>
            <View style={styles.simBarTrack}>
              <View
                style={[
                  styles.simBarFill,
                  { width: `${Math.min(100, (1 / months) * 100 * 5)}%` },
                ]}
              />
            </View>
            <Text style={styles.simBarHint}>
              {months <= 6 ? '🔥 Muito próximo!' :
               months <= 12 ? '👍 Atingível em menos de 1 ano' :
               months <= 24 ? '💪 Possível em até 2 anos' :
               '📈 Metas maiores precisam de mais tempo'}
            </Text>
          </>
        )}
      </View>

      {/* Lembrete mensal (#4) */}
      {monthly > 0 && (
        <Pressable onPress={onSetReminder} style={styles.reminderBtn}>
          <Text style={styles.reminderBtnIcon}>🔔</Text>
          <Text style={styles.reminderBtnText}>
            Me lembre dia 1 de cada mês de guardar {currency} {fmt(monthly)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Linha de cenário de poupança (usada na comparação)
function ScenarioRow({ sc, currency, fmt, isHighlight }: {
  sc: SavingsScenario; currency: string; fmt: (n: number) => string; isHighlight: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.scenarioRow, isHighlight && styles.scenarioRowHighlight]}>
      <View style={styles.scenarioLeft}>
        <Text style={styles.scenarioMonthly}>{currency} {fmt(sc.monthly)}/mês</Text>
        {isHighlight && (
          <View style={styles.scenarioRecommBadge}>
            <Text style={styles.scenarioRecommText}>⭐ Recomendado</Text>
          </View>
        )}
      </View>
      <View style={styles.scenarioRight}>
        {sc.months === 0 ? (
          <Text style={[styles.scenarioMonths, { color: colors.success }]}>Já pode ir! 🎉</Text>
        ) : (
          <>
            <Text style={[styles.scenarioMonths, isHighlight && { color: colors.primary }]}>
              {sc.months} {sc.months === 1 ? 'mês' : 'meses'}
            </Text>
            <Text style={styles.scenarioDate}>{sc.date}</Text>
          </>
        )}
      </View>
    </View>
  );
}

// Comparação de 2 destinos (#2)
function CompareView({
  result, savedAmount, monthly, currency, onPickA, onPickB, onRecalculate,
}: {
  result: any; savedAmount: number; monthly: number; currency: string;
  onPickA: () => void; onPickB: () => void; onRecalculate: () => void;
}) {
  const styles = useStyles();
  function fmt(n: number) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const fA = computeFeasibility(result.a.estimate.total, savedAmount, monthly);
  const fB = computeFeasibility(result.b.estimate.total, savedAmount, monthly);
  const labelA = feasibilityLabel(fA);
  const labelB = feasibilityLabel(fB);
  const cheaperIs = result.a.estimate.total <= result.b.estimate.total ? 'a' : 'b';

  return (
    <View style={styles.resultWrap}>
      <Text style={[styles.stageTitle, { textAlign: 'center' }]}>Comparação</Text>
      <Text style={[styles.stageHint, { textAlign: 'center', marginBottom: spacing.lg }]}>
        Qual viagem cabe melhor no seu orçamento?
      </Text>

      {[
        { key: 'a', dest: result.a.destination, est: result.a.estimate, feasibility: labelA, pct: fA, onPick: onPickA },
        { key: 'b', dest: result.b.destination, est: result.b.estimate, feasibility: labelB, pct: fB, onPick: onPickB },
      ].map((side) => (
        <View key={side.key} style={[styles.compareCard, side.key === cheaperIs && styles.compareCardWinner]}>
          {side.key === cheaperIs && (
            <View style={styles.compareWinnerBadge}>
              <Text style={styles.compareWinnerText}>💰 Mais barata</Text>
            </View>
          )}
          <Text style={styles.compareDestName}>{side.dest}</Text>
          <Text style={styles.compareTotalValue}>
            {currency} {fmt(side.est.total)}
          </Text>

          {/* Viabilidade */}
          <View style={[styles.gaugeBadge, { backgroundColor: side.feasibility.color + '22', alignSelf: 'flex-start', marginBottom: spacing.sm }]}>
            <Text style={[styles.gaugeBadgeText, { color: side.feasibility.color }]}>
              {side.feasibility.emoji} {side.feasibility.label}
            </Text>
          </View>

          {/* Top 3 categorias */}
          {side.est.items.slice(0, 3).map((item: PlanCategoryItem) => (
            <View key={item.key} style={styles.compareItem}>
              <Text style={styles.compareItemEmoji}>{item.emoji}</Text>
              <Text style={styles.compareItemLabel}>{item.label}</Text>
              <Text style={styles.compareItemAmount}>{currency} {fmt(item.amount)}</Text>
            </View>
          ))}

          <Button title={`Escolher ${side.dest}`} variant={side.key === cheaperIs ? 'primary' : 'secondary'}
            onPress={side.onPick} fullWidth style={{ marginTop: spacing.md }} />
        </View>
      ))}

      <Button title="Recalcular" variant="ghost" onPress={onRecalculate} fullWidth />
    </View>
  );
}

// Card do histórico (#1)
function HistoryCard({
  plan,
  currency,
  onOpen,
  onRecalculate,
  onDelete,
}: {
  plan: any;
  currency: string;
  onOpen: () => void;
  onRecalculate: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const estimate = plan.estimate_data as TripPlanEstimate;
  const total = estimate?.total ?? 0;
  const date = new Date(plan.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const styleLabel = TRAVEL_STYLE_LABELS[plan.travel_style as TravelStyle]?.split(' ').slice(1).join(' ') ?? plan.travel_style;
  const styleEmoji = STYLE_ICONS[plan.travel_style as TravelStyle] ?? '⚖️';
  const feasibilityPct = computeFeasibility(total, plan.budget_saved ?? 0, plan.budget_monthly ?? 0);
  const feasibility = feasibilityLabel(feasibilityPct);

  function fmt(n: number) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  return (
    <View style={styles.histCard}>
      {/* Header do card */}
      <Pressable onPress={onOpen} style={styles.histCardHeader}>
        <View style={styles.histCardLeft}>
          <Text style={styles.histStyleEmoji}>{styleEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.histDest} numberOfLines={1}>{plan.destination}</Text>
            <Text style={styles.histMeta}>
              {plan.days_count} dias · {styleLabel} · {plan.travelers_count ?? 1} {plan.travelers_count === 1 ? 'pessoa' : 'pessoas'}
            </Text>
            <Text style={styles.histDate}>{date}</Text>
          </View>
        </View>
        <View style={styles.histCardRight}>
          <Text style={styles.histTotal}>{currency} {fmt(total)}</Text>
          <View style={[styles.histFeasBadge, { backgroundColor: feasibility.color + '22' }]}>
            <Text style={[styles.histFeasText, { color: feasibility.color }]}>
              {feasibility.emoji} {feasibility.label}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Breakdown rápido dos top 3 categorias */}
      {estimate?.items && estimate.items.length > 0 && (
        <View style={styles.histItemsRow}>
          {estimate.items.slice(0, 3).map((item) => (
            <View key={item.key} style={styles.histItemChip}>
              <Text style={styles.histItemEmoji}>{item.emoji}</Text>
              <Text style={styles.histItemAmount}>{currency} {fmt(item.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Ações */}
      <View style={styles.histActions}>
        <Pressable onPress={onOpen} style={[styles.histAction, styles.histActionPrimary]}>
          <Text style={styles.histActionTextPrimary}>📊 Ver resultado</Text>
        </Pressable>
        <Pressable onPress={onRecalculate} style={styles.histAction}>
          <Text style={styles.histActionText}>🔄 Recalcular</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={[styles.histAction, styles.histActionDanger]}>
          <Text style={styles.histActionTextDanger}>🗑️</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Constante local (não exportada da lib)
// (STYLE_ICONS definido no topo do arquivo)

// Category row com barra de progresso
function CategoryRow({ item, total, currency, fmt }: {
  item: PlanCategoryItem; total: number; currency: string; fmt: (n: number) => string;
}) {
  const styles = useStyles();
  const pct = total > 0 ? (item.amount / total) * 100 : 0;
  return (
    <View style={styles.catRow}>
      <Text style={styles.catEmoji}>{item.emoji}</Text>
      <View style={styles.catContent}>
        <View style={styles.catTopRow}>
          <Text style={styles.catLabel}>{item.label}</Text>
          <Text style={styles.catAmount}>{currency} {fmt(item.amount)}</Text>
        </View>
        <View style={styles.catBarTrack}>
          <View style={[styles.catBarFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.catNote}>{item.note}</Text>
      </View>
    </View>
  );
}

function StageFade({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const offset = useSharedValue(16);
  opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
  offset.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Styles ─────────────────────────────────────────────────────

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  progressBarWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  progressStepLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  histBtn: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  content: { padding: spacing.xl, paddingBottom: 100 },

  stageEmoji: { fontSize: 48, textAlign: 'center', marginBottom: spacing.md },
  stageTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800', letterSpacing: letterSpacing.tighter, textAlign: 'center', marginBottom: spacing.xs },
  stageHint: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 },

  bigInput: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, color: colors.text, fontSize: fontSize.xl, fontWeight: '600', textAlign: 'center' },

  compareToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md },
  compareToggleActive: { backgroundColor: colors.primarySofter, borderColor: colors.primary },
  compareToggleIcon: { fontSize: 20 },
  compareToggleLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  compareToggleHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  checkBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '700' },

  suggestLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  suggestChip: { paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  suggestChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  suggestChipText: { color: colors.text, fontSize: fontSize.sm },

  daysRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  dayChip: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  dayNum: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  dayNumActive: { color: colors.primary },
  dayLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  customDaysRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  customDaysLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  customDaysInput: { width: 56, height: 40, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  customDaysUnit: { color: colors.textMuted, fontSize: fontSize.sm },

  sectionLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase', marginBottom: spacing.sm },
  travelersRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  travelerChip: { flex: 1, minWidth: 70, alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, gap: 4 },
  travelerChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  travelerEmoji: { fontSize: 22 },
  travelerLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },

  styleList: { gap: spacing.md },
  styleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: spacing.md },
  styleCardActive: { backgroundColor: colors.primarySofter, borderColor: colors.primary },
  styleIcon: { fontSize: 28, width: 44, textAlign: 'center' },
  styleText: { flex: 1 },
  styleTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginBottom: 3 },
  styleDesc: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18 },
  styleRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  styleRadioActive: { borderColor: colors.primary },
  styleRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  exchangeBox: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  exchangeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exchangeTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  exchangeAuto: { color: colors.textMuted, fontSize: fontSize.xs },
  exchangeRow: { flexDirection: 'row', gap: spacing.sm },
  exchangeItem: { flex: 1, gap: 4 },
  exchangeFlag: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  exchangeInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, gap: spacing.xs },
  exchangePrefix: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  exchangeInput: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '700', paddingVertical: 8 },

  budgetSection: { gap: spacing.sm, marginBottom: spacing.md },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.lg, gap: spacing.sm },
  currencySymbol: { color: colors.textMuted, fontSize: fontSize.lg, fontWeight: '700' },
  budgetInput: { flex: 1, color: colors.text, fontSize: fontSize.xxl, fontWeight: '700', paddingVertical: spacing.md },
  budgetHint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18, fontStyle: 'italic' },

  summaryPreview: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  summaryPreviewTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase', marginBottom: spacing.xs },
  summaryPreviewLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },

  loadingWrap: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.md },
  loadingEmoji: { fontSize: 56 },
  loadingTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  loadingStep: { color: colors.primary, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  loadingHint: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

  resultWrap: { gap: spacing.lg },
  resultHero: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center', gap: spacing.sm, ...shadow.md },
  resultHeroEmoji: { fontSize: 40 },
  resultHeroTitle: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800', letterSpacing: letterSpacing.tighter },
  resultHeroSub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
  resultTotalBox: { backgroundColor: colors.primarySofter, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.primary + '30', alignItems: 'center', marginTop: spacing.sm, width: '100%' },
  resultTotalLabel: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase' },
  resultTotalValue: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800', letterSpacing: letterSpacing.tighter },

  gaugeWrap: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gaugeTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase' },
  gaugeBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1 },
  gaugeBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  gaugeTrack: { height: 12, backgroundColor: colors.surfaceAlt, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  gaugeFill: { height: '100%', borderRadius: 6 },
  gaugeMarker: { position: 'absolute', top: -2, width: 4, height: 16, backgroundColor: colors.text, borderRadius: 2, marginLeft: -2 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gaugeLabelL: { color: colors.textMuted, fontSize: fontSize.xs },
  gaugeLabelR: { color: colors.textMuted, fontSize: fontSize.xs },
  gaugePct: { fontSize: fontSize.lg, fontWeight: '800' },

  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  sectionSuccess: { backgroundColor: colors.successSoft, borderColor: colors.success + '40' },
  sectionWarning: { backgroundColor: colors.primarySofter, borderColor: colors.primary + '30' },
  sectionHeader: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: letterSpacing.widest, textTransform: 'uppercase' },

  catRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  catEmoji: { fontSize: 20, width: 28, textAlign: 'center', marginTop: 2 },
  catContent: { flex: 1, gap: 4 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  catAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  catBarTrack: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2, opacity: 0.7 },
  catNote: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },

  budgetStatusEmoji: { fontSize: 32, textAlign: 'center' },
  budgetStatusTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  budgetStatusDesc: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },

  scenarioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  scenarioRowHighlight: { backgroundColor: colors.primarySofter, borderColor: colors.primary + '50' },
  scenarioLeft: { gap: 4 },
  scenarioRight: { alignItems: 'flex-end' },
  scenarioMonthly: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  scenarioRecommBadge: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  scenarioRecommText: { color: colors.primaryTextOnSolid, fontSize: 10, fontWeight: '700' },
  scenarioMonths: { color: colors.primary, fontSize: fontSize.xl, fontWeight: '800' },
  scenarioDate: { color: colors.textMuted, fontSize: fontSize.xs },

  // Simulador interativo
  simHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: -spacing.xs,
  },
  simInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  simCurrencyLabel: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  simInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    paddingVertical: spacing.md,
    letterSpacing: -1,
  },
  simPerMonth: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  simQuickRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  simQuickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  simQuickChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  simQuickLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  simResult: {
    backgroundColor: colors.primarySofter,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  simResultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  simResultMonths: {
    color: colors.primary,
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 60,
    letterSpacing: -2,
  },
  simResultUnit: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: '600',
  },
  simResultDate: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  simBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  simBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  simBarHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },

  reminderBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: spacing.md, marginTop: spacing.xs },
  reminderBtnIcon: { fontSize: 18 },
  reminderBtnText: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },

  tipRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  tipEmoji: { fontSize: 18, width: 24, textAlign: 'center' },
  tipText: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },

  messageBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  messageIcon: { fontSize: 22 },
  messageText: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 22, fontStyle: 'italic' },

  ctaStack: { gap: spacing.sm },
  disclaimer: { color: colors.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 16, paddingBottom: spacing.xl },

  // Compare
  compareCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  compareCardWinner: { borderColor: colors.primary, borderWidth: 2 },
  compareWinnerBadge: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, alignSelf: 'flex-start' },
  compareWinnerText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  compareDestName: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  compareTotalValue: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: '800' },
  compareItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compareItemEmoji: { fontSize: 16, width: 24 },
  compareItemLabel: { flex: 1, color: colors.textMuted, fontSize: fontSize.sm },
  compareItemAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },

  // History
  // History card
  histCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  histCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  histCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  histCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  histStyleEmoji: { fontSize: 22, marginTop: 2 },
  histDest: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  histMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  histDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  histTotal: { color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' },
  histFeasBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  histFeasText: { fontSize: 10, fontWeight: '700' },
  histItemsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  histItemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  histItemEmoji: { fontSize: 12 },
  histItemAmount: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  histActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  histAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  histActionPrimary: {
    backgroundColor: colors.primarySofter,
  },
  histActionDanger: {
    flex: 0,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRightWidth: 0,
  },
  histActionText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  histActionTextPrimary: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  histActionTextDanger: {
    fontSize: 16,
  },

  // Empty
  emptyBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic' },
}), [themeVersion]);
}
