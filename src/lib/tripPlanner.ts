import { callOpenAI } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────

export type TravelStyle = 'budget' | 'moderate' | 'comfort';

export const TRAVEL_STYLE_LABELS: Record<TravelStyle, string> = {
  budget: '🌱 Econômico',
  moderate: '⚖️ Moderado',
  comfort: '✨ Confortável',
};

export const TRAVEL_STYLE_DESCRIPTIONS: Record<TravelStyle, string> = {
  budget: 'Hostel, transporte público, street food e restaurantes simples',
  moderate: 'Hotel 3★, restaurantes médios, alguns tours e experiências',
  comfort: 'Hotel 4★+, experiências premium, passeios privados',
};

export type PlanCategoryItem = {
  key: string;
  label: string;
  emoji: string;
  amount: number;
  note: string;
};

export type SavingsScenario = {
  monthly: number;
  months: number;
  date: string;
};

export type TripTip = {
  emoji: string;
  text: string;
};

export type TripPlanEstimate = {
  total: number;
  currency: string;
  items: PlanCategoryItem[];
  months_needed: number | null;
  savings_scenarios: SavingsScenario[];
  feasibility_message: string;
  tips?: TripTip[];
};

export type TripPlanInput = {
  destination: string;
  daysCount: number;
  travelStyle: TravelStyle;
  travelersCount: number;
  budgetSaved: number;
  budgetMonthly: number;
  currency: string;
  exchangeRateUSD?: number;
  exchangeRateEUR?: number;
};

export type FinancialProfile = {
  defaultMonthlySavings: number | null;
  defaultCurrency: string | null;
};

export type TripPlanCheckin = {
  id: string;
  plan_id: string;
  amount_saved: number;
  note: string | null;
  checked_at: string;
};

// ─── System prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um especialista em finanças e planejamento de viagens internacionais para brasileiros.
Quando o usuário pede uma estimativa de custo para uma viagem, você fornece valores REALISTAS em BRL (reais brasileiros),
baseados nos preços atuais do mercado.

SEMPRE retorne um JSON válido com exatamente essa estrutura:
{
  "total": <número em BRL>,
  "items": [
    {
      "key": "flight",
      "label": "Passagem aérea",
      "emoji": "✈️",
      "amount": <número>,
      "note": "<breve explicação>"
    }
  ],
  "feasibility_message": "<mensagem encorajadora de 1-2 frases>",
  "tips": [
    { "emoji": "💡", "text": "<dica prática e específica pro destino>" },
    { "emoji": "📅", "text": "<dica de quando comprar passagem>" },
    { "emoji": "🏨", "text": "<dica de hospedagem>" },
    { "emoji": "💳", "text": "<dica de cartão/dinheiro>" }
  ]
}

Categorias obrigatórias (adapte os valores ao destino e estilo):
- flight: Passagem aérea (ida e volta) ✈️
- accommodation: Hospedagem 🏨
- food: Alimentação 🍽️
- local_transport: Transporte local 🚌
- activities: Passeios e atrações 🎭
- travel_insurance: Seguro viagem 🛡️
- sim_card: Chip celular 📱
- misc: Gastos extras e imprevistos 💸

Regras:
- Valores em BRL usando câmbio fornecido pelo usuário (se não informado, use EUR=6.2, USD=5.9)
- Passagem referência GRU (São Paulo)
- Econômico: hostel/airbnb, street food, transporte público
- Moderado: hotel 3★, restaurantes médios, 1-2 tours/semana
- Confortável: hotel 4★+, restaurantes bons, experiências privadas
- Hospedagem divide pelo nº de viajantes, passagem multiplica
- Tips: 4 dicas ESPECÍFICAS pro destino e perfil (não genéricas)`;

// ─── Estimate ───────────────────────────────────────────────────

export async function generateTripPlanEstimate(
  input: TripPlanInput,
): Promise<TripPlanEstimate> {
  const styleMap = {
    budget: 'econômico',
    moderate: 'moderado',
    comfort: 'confortável',
  };

  const exchangeInfo = [
    input.exchangeRateUSD ? `USD/BRL: ${input.exchangeRateUSD}` : '',
    input.exchangeRateEUR ? `EUR/BRL: ${input.exchangeRateEUR}` : '',
  ].filter(Boolean).join(', ');

  const prompt = `Calcule a estimativa de custo para:
- Destino: ${input.destination}
- Duração: ${input.daysCount} dias
- Estilo: ${styleMap[input.travelStyle]}
- Viajantes: ${input.travelersCount} pessoa${input.travelersCount > 1 ? 's' : ''}
${exchangeInfo ? `- Câmbio atual: ${exchangeInfo}` : ''}

Retorne APENAS o JSON, sem texto adicional, sem markdown.`;

  let raw: string;
  try {
    raw = await callOpenAI({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      timeoutMs: 90_000,
    });
  } catch (err: any) {
    let msg = err?.message ?? 'Erro';
    if (err?.name === 'AbortError' || msg.includes('Aborted')) msg = 'A IA demorou demais. Tente de novo.';
    else if (msg.includes('401') || msg.includes('OPENAI')) msg = 'Chave OpenAI não configurada.';
    else if (msg.includes('429')) msg = 'Muitas requisições. Aguarde alguns segundos.';
    throw new Error(msg);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('IA retornou resposta inválida. Tente de novo.');
  }

  if (!parsed.total || !Array.isArray(parsed.items)) {
    throw new Error('Resposta da IA incompleta. Tente de novo.');
  }

  const total = parsed.total;
  const missing = Math.max(0, total - input.budgetSaved);

  const scenarios = buildSavingsScenarios(missing, input.budgetMonthly, input.currency);

  return {
    total,
    currency: input.currency,
    items: parsed.items,
    months_needed: missing > 0 && input.budgetMonthly > 0
      ? Math.ceil(missing / input.budgetMonthly)
      : null,
    savings_scenarios: scenarios,
    feasibility_message: parsed.feasibility_message ?? '',
    tips: parsed.tips ?? [],
  };
}

function buildSavingsScenarios(
  missing: number,
  baseMonthly: number,
  _currency: string,
): SavingsScenario[] {
  const bases = baseMonthly > 0
    ? [baseMonthly * 0.75, baseMonthly, baseMonthly * 1.5]
    : [300, 500, 800];

  return bases
    .map((monthly) => {
      const months = missing > 0 ? Math.ceil(missing / monthly) : 0;
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      const date = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return {
        monthly: Math.round(monthly),
        months,
        date: date.charAt(0).toUpperCase() + date.slice(1),
      };
    })
    .sort((a, b) => b.months - a.months)
    .slice(0, 3);
}

// ─── Comparação de 2 destinos ───────────────────────────────────

export type ComparisonResult = {
  a: { destination: string; estimate: TripPlanEstimate };
  b: { destination: string; estimate: TripPlanEstimate };
};

export async function compareTwoDestinations(
  baseInput: Omit<TripPlanInput, 'destination'>,
  destA: string,
  destB: string,
): Promise<ComparisonResult> {
  const [a, b] = await Promise.all([
    generateTripPlanEstimate({ ...baseInput, destination: destA }),
    generateTripPlanEstimate({ ...baseInput, destination: destB }),
  ]);
  return { a: { destination: destA, estimate: a }, b: { destination: destB, estimate: b } };
}

// ─── Perfil financeiro ──────────────────────────────────────────

export async function loadFinancialProfile(): Promise<FinancialProfile> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { defaultMonthlySavings: null, defaultCurrency: null };

  const { data } = await supabase
    .from('profiles')
    .select('default_monthly_savings, default_currency')
    .eq('id', userData.user.id)
    .single();

  return {
    defaultMonthlySavings: (data as any)?.default_monthly_savings ?? null,
    defaultCurrency: (data as any)?.default_currency ?? null,
  };
}

export async function saveFinancialProfile(
  monthlySavings: number,
  currency: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return;

  await supabase
    .from('profiles')
    .update({
      default_monthly_savings: monthlySavings,
      default_currency: currency,
    } as any)
    .eq('id', userData.user.id);
}

// ─── Histórico de planos ────────────────────────────────────────

export async function listMyPlans(): Promise<any[]> {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function deletePlan(planId: string): Promise<void> {
  await supabase.from('trip_plans').delete().eq('id', planId);
}

export async function saveTripPlan(
  input: TripPlanInput,
  estimate: TripPlanEstimate,
): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from('trip_plans')
    .insert({
      profile_id: userData.user.id,
      destination: input.destination,
      days_count: input.daysCount,
      travel_style: input.travelStyle,
      travelers_count: input.travelersCount,
      budget_saved: input.budgetSaved,
      budget_monthly: input.budgetMonthly,
      currency: input.currency,
      estimate_data: estimate,
    })
    .select('id')
    .single();

  if (error) return null;
  return data?.id ?? null;
}

// ─── Check-ins de progresso ────────────────────────────────────

export async function addCheckin(
  planId: string,
  amountSaved: number,
  note?: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return;

  await supabase.from('trip_plan_checkins').insert({
    plan_id: planId,
    profile_id: userData.user.id,
    amount_saved: amountSaved,
    note: note ?? null,
  });
}

export async function listCheckins(planId: string): Promise<TripPlanCheckin[]> {
  const { data } = await supabase
    .from('trip_plan_checkins')
    .select('*')
    .eq('plan_id', planId)
    .order('checked_at', { ascending: true });
  return (data ?? []) as TripPlanCheckin[];
}

// ─── Câmbio ─────────────────────────────────────────────────────

/**
 * Busca cotação atual USD/BRL e EUR/BRL via API pública (AwesomeAPI).
 * Grátis, sem chave necessária.
 */
export async function fetchExchangeRates(): Promise<{
  usd: number | null;
  eur: number | null;
}> {
  try {
    const res = await fetch(
      'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL',
    );
    if (!res.ok) return { usd: null, eur: null };
    const data = await res.json();
    return {
      usd: parseFloat(data?.USDBRL?.bid ?? '0') || null,
      eur: parseFloat(data?.EURBRL?.bid ?? '0') || null,
    };
  } catch {
    return { usd: null, eur: null };
  }
}

// ─── Viabilidade ────────────────────────────────────────────────

/**
 * Calcula % de viabilidade (0-100) pra mostrar no gauge.
 * Considera: quanto tem vs total, quanto guarda vs falta por mês.
 */
export function computeFeasibility(
  total: number,
  saved: number,
  monthly: number,
): number {
  if (total <= 0) return 100;
  if (saved >= total) return 100;

  const savedPct = (saved / total) * 100;
  const missing = total - saved;
  const monthsNeeded = monthly > 0 ? missing / monthly : 999;

  // Menos de 6 meses = ótimo, 12 meses = ok, 24+ = difícil
  const timePct = Math.max(0, 100 - ((monthsNeeded - 3) / 21) * 100);

  return Math.round(savedPct * 0.4 + timePct * 0.6);
}

export function feasibilityLabel(pct: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (pct >= 80) return { label: 'Muito próximo!', color: '#10b981', emoji: '🟢' };
  if (pct >= 55) return { label: 'Possível!', color: '#f59e0b', emoji: '🟡' };
  if (pct >= 30) return { label: 'Com esforço', color: '#f97316', emoji: '🟠' };
  return { label: 'Longo prazo', color: '#ef4444', emoji: '🔴' };
}
