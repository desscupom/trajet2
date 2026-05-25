import {useState, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ThemeProvider';
import Svg, {
  Circle,
  G,
  Line,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { FadeInView } from '@/components/FadeInView';
import { X } from '@/components/Icon';
import type { TripMemberWithProfile } from '@/hooks/useTripMembers';
import type { Expense } from '@/components/trip/expense/types';
import {
  colors,
  fontSize,
  letterSpacing,
  radius,
  spacing,
} from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  expenses: Expense[];
  members: TripMemberWithProfile[];
  baseCurrency: string;
  categoryColors: Record<string, string>;
  categoryLabels: Record<string, string>;
  currentUserId?: string;
};

type DayGrouped = { date: string; label: string; total: number };
type CategorySegment = {
  key: string;
  label: string;
  value: number;
  color: string;
  percent: number;
};
type PersonTotal = {
  profileId: string;
  name: string;
  total: number;
  percent: number;
};

/** Formata valor compacto: 1500 → "1,5k", 12000 → "12k" */
function compactAmount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return Math.round(n).toString();
}

/** Cor com alpha */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ──────────────────────────────────────────────
// DONUT CHART
// ──────────────────────────────────────────────

function DonutChart({
  segments,
  total,
  currency,
}: {
  segments: CategorySegment[];
  total: number;
  currency: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = 70;
  const STROKE = 26;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const GAP = 2; // gap em graus entre segmentos

  /** Converte percent 0-100 em dasharray pra strokeDasharray */
  function segmentDash(pct: number): string {
    const dashLen = (pct / 100) * CIRCUMFERENCE;
    const gapLen = CIRCUMFERENCE - dashLen;
    return `${dashLen} ${gapLen}`;
  }

  let cumulativePct = -25; // começa do topo (–25% = –90 graus)

  const activeSegment = active ? segments.find((s) => s.key === active) : null;

  return (
    <View style={donutStyles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* Fundo cinza */}
        <Circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke={colors.surfaceAlt}
          strokeWidth={STROKE}
        />
        {segments.map((seg) => {
          const offset = (cumulativePct / 100) * CIRCUMFERENCE;
          const isActive = active === seg.key;
          const adjustedPct = Math.max(0, seg.percent - (GAP / 360) * 100);

          const el = (
            <Pressable key={seg.key} onPress={() => setActive(isActive ? null : seg.key)}>
              <Circle
                cx={CX}
                cy={CY}
                r={RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={isActive ? STROKE + 4 : STROKE}
                strokeDasharray={segmentDash(adjustedPct)}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                rotation={-90}
                origin={`${CX},${CY}`}
                opacity={active && !isActive ? 0.35 : 1}
              />
            </Pressable>
          );
          cumulativePct += seg.percent;
          return el;
        })}

        {/* Centro: valor/categoria quando ativo, senão total */}
        <G>
          <SvgText
            x={CX}
            y={CY - 8}
            textAnchor="middle"
            fill={colors.text}
            fontSize={13}
            fontWeight="700"
          >
            {activeSegment
              ? compactAmount(activeSegment.value)
              : compactAmount(total)}
          </SvgText>
          <SvgText
            x={CX}
            y={CY + 10}
            textAnchor="middle"
            fill={colors.textMuted}
            fontSize={10}
          >
            {activeSegment ? currency : currency + ' total'}
          </SvgText>
          {activeSegment && (
            <SvgText
              x={CX}
              y={CY + 24}
              textAnchor="middle"
              fill={activeSegment.color}
              fontSize={10}
              fontWeight="600"
            >
              {activeSegment.percent.toFixed(0)}%
            </SvgText>
          )}
        </G>
      </Svg>

      {/* Legenda */}
      <View style={donutStyles.legend}>
        {segments.map((seg) => (
          <Pressable
            key={seg.key}
            onPress={() => setActive(active === seg.key ? null : seg.key)}
            style={donutStyles.legendRow}
          >
            <View
              style={[
                donutStyles.dot,
                { backgroundColor: seg.color },
                active && active !== seg.key && { opacity: 0.3 },
              ]}
            />
            <Text
              style={[
                donutStyles.legendLabel,
                active === seg.key && { color: colors.text, fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
            <Text
              style={[
                donutStyles.legendPct,
                { color: seg.color },
              ]}
            >
              {seg.percent.toFixed(0)}%
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  legend: { flex: 1, gap: 6 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  legendPct: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
});

// ──────────────────────────────────────────────
// BAR CHART (por dia)
// ──────────────────────────────────────────────

function BarChart({
  data,
  currency,
}: {
  data: DayGrouped[];
  currency: string;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const W = 320;
  const H = 130;
  const PAD = { top: 20, right: 8, bottom: 30, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.total));
  const BAR_W = Math.min(28, (chartW / data.length) * 0.6);
  const BAR_GAP = chartW / data.length;

  // Grid lines
  const gridValues = [0, maxVal * 0.5, maxVal];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={Math.max(W, data.length * 40 + PAD.left + PAD.right)} height={H}>
        {/* Grid horizontais */}
        {gridValues.map((val, i) => {
          const y = PAD.top + chartH - (val / maxVal) * chartH;
          return (
            <G key={i}>
              <Line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + chartW}
                y2={y}
                stroke={colors.border}
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
              <SvgText
                x={PAD.left - 4}
                y={y + 4}
                textAnchor="end"
                fill={colors.textMuted}
                fontSize={9}
              >
                {val > 0 ? compactAmount(val) : '0'}
              </SvgText>
            </G>
          );
        })}

        {/* Barras */}
        {data.map((d, i) => {
          const barH = maxVal > 0 ? (d.total / maxVal) * chartH : 0;
          const x = PAD.left + i * BAR_GAP + (BAR_GAP - BAR_W) / 2;
          const y = PAD.top + chartH - barH;
          const isActive = activeIdx === i;

          return (
            <G key={d.date}>
              <Pressable onPress={() => setActiveIdx(isActive ? null : i)}>
                <Rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={Math.max(barH, 2)}
                  rx={4}
                  fill={isActive ? colors.primary : withAlpha(colors.primary, 0.5)}
                />
              </Pressable>

              {/* Label do dia */}
              <SvgText
                x={x + BAR_W / 2}
                y={H - 6}
                textAnchor="middle"
                fill={isActive ? colors.text : colors.textMuted}
                fontSize={9}
                fontWeight={isActive ? '700' : '400'}
              >
                {d.label}
              </SvgText>

              {/* Tooltip acima da barra */}
              {isActive && (
                <G>
                  <Rect
                    x={x + BAR_W / 2 - 22}
                    y={y - 22}
                    width={44}
                    height={18}
                    rx={4}
                    fill={colors.primary}
                  />
                  <SvgText
                    x={x + BAR_W / 2}
                    y={y - 9}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={9}
                    fontWeight="700"
                  >
                    {currency} {compactAmount(d.total)}
                  </SvgText>
                </G>
              )}
            </G>
          );
        })}
      </Svg>
    </ScrollView>
  );
}

// ──────────────────────────────────────────────
// HORIZONTAL BAR (por pessoa)
// ──────────────────────────────────────────────

function PersonBar({ person, currency }: { person: PersonTotal; currency: string }) {
  return (
    <View style={personStyles.row}>
      <Text style={personStyles.name} numberOfLines={1}>
        {person.name}
      </Text>
      <View style={personStyles.barTrack}>
        <View
          style={[
            personStyles.barFill,
            { width: `${person.percent}%` },
          ]}
        />
      </View>
      <Text style={personStyles.amount}>
        {currency} {compactAmount(person.total)}
      </Text>
    </View>
  );
}

const personStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    width: 80,
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  amount: {
    width: 60,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textAlign: 'right',
  },
});

// ──────────────────────────────────────────────
// DASHBOARD MODAL
// ──────────────────────────────────────────────

export function ExpenseDashboard({
  visible,
  onClose,
  expenses,
  members,
  baseCurrency,
  categoryColors,
  categoryLabels,
  currentUserId,
}: Props) {
  const styles = useStyles();
  const [view, setView] = useState<'all' | 'mine'>('all');

  // Filtra por view (total vs minhas)
  const filteredExpenses = view === 'mine' && currentUserId
    ? expenses.filter((e) => e.paid_by === currentUserId)
    : expenses;

  const total = filteredExpenses.reduce((s, e) => s + e.amount_in_base, 0);
  const count = filteredExpenses.length;

  // ── Por categoria
  const categoryMap: Record<string, number> = {};
  for (const e of filteredExpenses) {
    const k = e.category || 'other';
    categoryMap[k] = (categoryMap[k] || 0) + e.amount_in_base;
  }
  const categorySegments: CategorySegment[] = Object.entries(categoryMap)
    .map(([key, value]) => ({
      key,
      label: categoryLabels[key] ?? key,
      value,
      color: categoryColors[key] ?? colors.textMuted,
      percent: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // ── Por pessoa
  const personMap: Record<string, number> = {};
  for (const e of filteredExpenses) {
    personMap[e.paid_by] = (personMap[e.paid_by] || 0) + e.amount_in_base;
  }
  const maxPerson = Math.max(...Object.values(personMap), 1);
  const personTotals: PersonTotal[] = Object.entries(personMap)
    .map(([profileId, total]) => {
      const m = members.find((m) => m.profile_id === profileId);
      return {
        profileId,
        name: m?.profile?.full_name ?? m?.profile?.email ?? 'Desconhecido',
        total,
        percent: (total / maxPerson) * 100,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ── Por dia
  const dayMap: Record<string, number> = {};
  for (const e of filteredExpenses) {
    const d = (e.expense_date ?? '').split('T')[0];
    dayMap[d] = (dayMap[d] || 0) + e.amount_in_base;
  }
  const dayData: DayGrouped[] = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => {
      const d = new Date(date + 'T12:00:00');
      const label = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      return { date, label, total };
    });

  // ── Estatísticas
  const avgPerDay =
    dayData.length > 0 ? total / dayData.length : 0;
  const maxCategory =
    categorySegments.length > 0 ? categorySegments[0] : null;
  const biggestExpense = [...filteredExpenses].sort(
    (a, b) => b.amount_in_base - a.amount_in_base,
  )[0];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dashboard de gastos</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Toggle Total vs Minhas */}
        {currentUserId && (
          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setView('all')}
              style={[styles.viewToggleBtn, view === 'all' && styles.viewToggleBtnActive]}
            >
              <Text style={[styles.viewToggleLabel, view === 'all' && styles.viewToggleLabelActive]}>
                Viagem toda
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setView('mine')}
              style={[styles.viewToggleBtn, view === 'mine' && styles.viewToggleBtnActive]}
            >
              <Text style={[styles.viewToggleLabel, view === 'mine' && styles.viewToggleLabelActive]}>
                Minhas despesas
              </Text>
            </Pressable>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FadeInView>
            {/* Cards de stat */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Total gasto"
                value={`${baseCurrency} ${compactAmount(total)}`}
                accent={colors.primary}
              />
              <StatCard
                label="Despesas"
                value={String(count)}
                accent={colors.info}
              />
              <StatCard
                label="Média/dia"
                value={`${baseCurrency} ${compactAmount(avgPerDay)}`}
                accent={colors.warning}
              />
              <StatCard
                label="Categorias"
                value={String(categorySegments.length)}
                accent={colors.success}
              />
            </View>

            {/* Donut — por categoria */}
            {categorySegments.length > 0 && (
              <View style={styles.section}>
                <SectionLabel title="Por categoria" />
                <DonutChart
                  segments={categorySegments}
                  total={total}
                  currency={baseCurrency}
                />
              </View>
            )}

            {/* Barra por dia */}
            {dayData.length > 0 && (
              <View style={styles.section}>
                <SectionLabel title="Por dia" />
                <BarChart data={dayData} currency={baseCurrency} />
              </View>
            )}

            {/* Por pessoa */}
            {personTotals.length > 0 && (
              <View style={styles.section}>
                <SectionLabel title="Por pessoa (pagador)" />
                <View style={styles.personList}>
                  {personTotals.map((p) => (
                    <PersonBar key={p.profileId} person={p} currency={baseCurrency} />
                  ))}
                </View>
              </View>
            )}

            {/* Insights */}
            {(maxCategory || biggestExpense) && (
              <View style={styles.section}>
                <SectionLabel title="Destaques" />
                {maxCategory && (
                  <InsightRow
                    emoji="📊"
                    text={`Maior categoria: ${maxCategory.label} (${maxCategory.percent.toFixed(0)}% do total)`}
                    color={maxCategory.color}
                  />
                )}
                {biggestExpense && (
                  <InsightRow
                    emoji="💸"
                    text={`Maior despesa: ${biggestExpense.description} — ${baseCurrency} ${compactAmount(biggestExpense.amount_in_base)}`}
                    color={colors.warning}
                  />
                )}
                {avgPerDay > 0 && (
                  <InsightRow
                    emoji="📅"
                    text={`Você gasta em média ${baseCurrency} ${compactAmount(avgPerDay)} por dia`}
                    color={colors.info}
                  />
                )}
              </View>
            )}
          </FadeInView>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SectionLabel({ title }: { title: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionLabel}>{title}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.statCard, { borderTopColor: accent }]}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InsightRow({
  emoji,
  text,
  color,
}: {
  emoji: string;
  text: string;
  color: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.insightRow, { borderLeftColor: color }]}>
      <Text style={styles.insightEmoji}>{emoji}</Text>
      <Text style={styles.insightText}>{text}</Text>
    </View>
  );
}

function useStyles() {
  const { themeVersion } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.tight,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tighter,
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.widest,
    textTransform: 'uppercase',
  },
  personList: { gap: spacing.md },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  insightEmoji: { fontSize: 16 },
  insightText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    margin: spacing.lg,
    marginBottom: 0,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.primarySoft,
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  viewToggleLabelActive: {
    color: colors.primary,
  },
}), [themeVersion]);
}
