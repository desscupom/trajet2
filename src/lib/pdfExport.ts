import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatDateBR, formatDateLongBR, formatDateRangeBR } from '@/lib/dates';
import { formatCurrency } from '@/lib/expenses';
import { LODGING_KIND_LABELS, type Lodging } from '@/lib/lodgings';
import type { Trip } from '@/lib/supabase';
import type { ItineraryItem, TripDay } from '@/components/trip/types';

/**
 * Geração de PDF da viagem — design editorial refinado.
 *
 * Estratégia de CSS pra compatibilidade máxima com expo-print (WebKit):
 * - Sem CSS Grid (bugado em algumas versões do WebKit iOS)
 * - Flexbox limitado — usa floats e display:table onde necessário
 * - Sem Google Fonts (não carregam offline) — usa system-ui stack
 * - Cores em hex puro (sem rgba com variáveis)
 * - page-break-inside: avoid em elementos críticos
 * - Todos os textos com font-size em pt (não em rem/em)
 */

export type TripPDFData = {
  trip: Trip;
  days: TripDay[];
  itineraryItems: ItineraryItem[];
  lodgings: Lodging[];
  expenses: ExpenseSummary[];
  tasks: TaskSummary[];
  members: Array<{ profile_id: string; full_name: string | null; email: string }>;
};

export type ExpenseSummary = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  amount_in_base: number;
  expense_date: string;
  category: string | null;
  paid_by: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  done: boolean;
  due_date: string | null;
};

// ─── Ponto de entrada ────────────────────────────────────────────

export async function generateAndShareTripPDF(data: TripPDFData): Promise<string> {
  const coverImageBase64 = await fetchCoverImageBase64(data.trip.cover_image_url);
  const html = buildDocument(data, coverImageBase64);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 595,
    height: 842,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${data.trip.title} — Roteiro`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

// ─── Imagem base64 ───────────────────────────────────────────────

async function fetchCoverImageBase64(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? null);
      reader.onerror = () => reject(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryEmoji(cat: string | null): string {
  const map: Record<string, string> = {
    food: '🍽️', lodging: '🏨', transport: '🚌', activities: '🎭',
    shopping: '🛍️', other: '💸',
  };
  return cat ? (map[cat] ?? '💸') : '💸';
}

function categoryLabel(cat: string | null): string {
  const map: Record<string, string> = {
    food: 'Alimentação', lodging: 'Hospedagem', transport: 'Transporte',
    activities: 'Atividades', shopping: 'Compras', other: 'Outros',
  };
  return cat ? (map[cat] ?? cat) : 'Outros';
}

// ─── Documento principal ─────────────────────────────────────────

function buildDocument(data: TripPDFData, cover: string | null): string {
  const memberMap: Record<string, string> = {};
  for (const m of data.members) {
    memberMap[m.profile_id] = m.full_name ?? m.email;
  }

  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount_in_base, 0);
  const sections = [
    buildCover(data.trip, cover),
    buildSummaryPage(data, totalExpenses),
    data.lodgings.length > 0 ? buildLodgingsSection(data.lodgings) : '',
    data.days.length > 0 ? buildItinerarySection(data.days, data.itineraryItems) : '',
    data.expenses.length > 0 ? buildExpensesSection(data.expenses, data.trip.base_currency, memberMap, totalExpenses) : '',
    data.tasks.length > 0 ? buildTasksSection(data.tasks) : '',
    buildFooter(data.trip.title),
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.trip.title)}</title>
<style>
${CSS}
</style>
</head>
<body>
${sections}
</body>
</html>`;
}

// ─── Capa ─────────────────────────────────────────────────────────

function buildCover(trip: Trip, cover: string | null): string {
  const dates = trip.start_date && trip.end_date
    ? formatDateRangeBR(trip.start_date, trip.end_date)
    : trip.start_date ? `A partir de ${formatDateBR(trip.start_date)}` : '';

  if (cover) {
    // Com foto de capa — layout imersivo
    return `
<div class="cover-full">
  <img class="cover-photo" src="data:image/jpeg;base64,${cover}" alt="Capa" />
  <div class="cover-overlay">
    <div class="cover-label">ROTEIRO DE VIAGEM</div>
    <h1 class="cover-title-img">${esc(trip.title)}</h1>
    ${dates ? `<div class="cover-dates-img">${esc(dates)}</div>` : ''}
  </div>
  ${trip.description ? `<div class="cover-desc-below">${esc(trip.description)}</div>` : ''}
</div>`;
  }

  // Sem foto — design tipográfico elegante com barra lateral colorida
  return `
<div class="cover-text">
  <div class="cover-accent-bar"></div>
  <div class="cover-text-content">
    <div class="cover-label">ROTEIRO DE VIAGEM</div>
    <h1 class="cover-title-text">${esc(trip.title)}</h1>
    ${dates ? `<div class="cover-dates-text">${esc(dates)}</div>` : ''}
    ${trip.description ? `<div class="cover-desc-text">${esc(trip.description)}</div>` : ''}
    <div class="cover-decoration">
      <div class="cover-deco-line"></div>
      <div class="cover-deco-dot"></div>
      <div class="cover-deco-line"></div>
    </div>
  </div>
</div>`;
}

// ─── Página de resumo ─────────────────────────────────────────────

function buildSummaryPage(data: TripPDFData, totalExpenses: number): string {
  const nights = data.days.length > 0 ? data.days.length : '—';
  const items = data.itineraryItems.length;
  const stats = [
    { value: String(nights), label: nights === 1 ? 'DIA' : 'DIAS' },
    { value: String(data.lodgings.length || '—'), label: 'HOSPEDAGENS' },
    { value: String(items || '—'), label: 'LUGARES' },
    { value: String(data.expenses.length || '—'), label: 'DESPESAS' },
  ];

  return `
<div class="page page-break">
  <div class="section-header">
    <div class="section-eyebrow">VISÃO GERAL</div>
    <h2 class="section-title">Resumo da viagem</h2>
  </div>

  <div class="stats-row">
    ${stats.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join('')}
  </div>

  ${totalExpenses > 0 ? `
  <div class="summary-total-box">
    <div class="summary-total-label">GASTO TOTAL ESTIMADO</div>
    <div class="summary-total-value">${formatCurrency(totalExpenses, data.trip.base_currency)}</div>
  </div>` : ''}

  ${data.days.length > 0 ? `
  <div class="timeline-section">
    <div class="subsection-title">CRONOGRAMA</div>
    ${data.days.slice(0, 12).map((day, i) => {
      const dayItems = data.itineraryItems.filter(it => it.trip_day_id === day.id);
      const names = dayItems.slice(0, 3).map(it => it.place?.name || it.custom_title || '').filter(Boolean);
      return `
    <div class="timeline-row">
      <div class="timeline-day">DIA ${i + 1}</div>
      <div class="timeline-date">${formatDateBR(day.day_date)}</div>
      <div class="timeline-bar"></div>
      <div class="timeline-places">${names.join(' · ') || '—'}</div>
    </div>`;
    }).join('')}
  </div>` : ''}
</div>`;
}

// ─── Hospedagens ──────────────────────────────────────────────────

function buildLodgingsSection(lodgings: Lodging[]): string {
  const sorted = [...lodgings].sort((a, b) => {
    if (!a.check_in_at) return 1;
    if (!b.check_in_at) return -1;
    return a.check_in_at.localeCompare(b.check_in_at);
  });

  return `
<div class="page page-break">
  <div class="section-header">
    <div class="section-eyebrow">ACOMODAÇÕES</div>
    <h2 class="section-title">Hospedagens</h2>
    <div class="section-count">${lodgings.length} ${lodgings.length === 1 ? 'hospedagem' : 'hospedagens'}</div>
  </div>

  ${sorted.map(l => {
    const kind = LODGING_KIND_LABELS[l.kind as keyof typeof LODGING_KIND_LABELS] ?? 'Hospedagem';
    const nights = l.check_in_at && l.check_out_at
      ? Math.round((new Date(l.check_out_at).getTime() - new Date(l.check_in_at).getTime()) / 86400000)
      : null;
    return `
  <div class="lodging-card">
    <div class="lodging-kind">${esc(kind).toUpperCase()}</div>
    <div class="lodging-name">${esc(l.name)}</div>
    ${l.address ? `<div class="lodging-address">📍 ${esc(l.address)}</div>` : ''}
    <div class="lodging-meta">
      ${l.check_in_at ? `<span class="meta-item"><span class="meta-label">CHECK-IN</span> ${formatDateBR((l.check_in_at ?? '').split('T')[0])}</span>` : ''}
      ${l.check_out_at ? `<span class="meta-item"><span class="meta-label">CHECK-OUT</span> ${formatDateBR((l.check_out_at ?? '').split('T')[0])}</span>` : ''}
      ${nights ? `<span class="meta-item"><span class="meta-label">NOITES</span> ${nights}</span>` : ''}
      ${(l as any).reservation_code ? `<span class="meta-item"><span class="meta-label">RESERVA</span> ${esc((l as any).reservation_code)}</span>` : ''}
      ${l.cost_amount ? `<span class="meta-item"><span class="meta-label">VALOR</span> ${formatCurrency(l.cost_amount, l.cost_currency ?? 'BRL')}</span>` : ''}
    </div>
    ${l.notes ? `<div class="lodging-notes">${esc(l.notes)}</div>` : ''}
  </div>`;
  }).join('')}
</div>`;
}

// ─── Roteiro ──────────────────────────────────────────────────────

function buildItinerarySection(days: TripDay[], items: ItineraryItem[]): string {
  const sorted = [...days].sort((a, b) => a.day_date.localeCompare(b.day_date));

  return `
<div class="page page-break">
  <div class="section-header">
    <div class="section-eyebrow">PROGRAMAÇÃO</div>
    <h2 class="section-title">Roteiro dia a dia</h2>
    <div class="section-count">${days.length} ${days.length === 1 ? 'dia' : 'dias'} · ${items.length} lugares</div>
  </div>

  ${sorted.map((day, idx) => {
    const dayItems = items
      .filter(it => it.trip_day_id === day.id)
      .sort((a, b) => {
        if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
        return (a.position ?? 0) - (b.position ?? 0);
      });

    return `
  <div class="day-block">
    <div class="day-header-row">
      <div class="day-number-badge">DIA ${idx + 1}</div>
      <div class="day-info">
        <div class="day-title">${esc(formatDateLongBR(day.day_date))}</div>
        ${day.notes ? `<div class="day-notes">${esc(day.notes)}</div>` : ''}
      </div>
    </div>

    ${dayItems.length === 0 ? `
    <div class="day-empty">Sem lugares planejados</div>` : dayItems.map(it => {
      const placeName = it.place?.name || it.custom_title || 'Sem nome';
      const address = it.place?.address;
      return `
    <div class="item-row">
      <div class="item-time">${it.start_time ? it.start_time.slice(0, 5) : '—:—'}</div>
      <div class="item-divider"></div>
      <div class="item-body">
        <div class="item-name">${esc(placeName)}</div>
        ${address ? `<div class="item-addr">📍 ${esc(address)}</div>` : ''}
        ${it.notes ? `<div class="item-note">${esc(it.notes)}</div>` : ''}
        ${it.duration_minutes ? `<div class="item-duration">⏱ ${it.duration_minutes} min</div>` : ''}
      </div>
    </div>`;
    }).join('')}
  </div>`;
  }).join('')}
</div>`;
}

// ─── Despesas ─────────────────────────────────────────────────────

function buildExpensesSection(
  expenses: ExpenseSummary[],
  baseCurrency: string,
  memberMap: Record<string, string>,
  total: number,
): string {
  // Agrupa por categoria
  const byCategory: Record<string, ExpenseSummary[]> = {};
  for (const e of expenses) {
    const cat = e.category ?? 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  }

  const categoryTotals = Object.entries(byCategory)
    .map(([cat, exps]) => ({
      cat,
      total: exps.reduce((s, e) => s + e.amount_in_base, 0),
      count: exps.length,
    }))
    .sort((a, b) => b.total - a.total);

  const sorted = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date));

  return `
<div class="page page-break">
  <div class="section-header">
    <div class="section-eyebrow">FINANÇAS</div>
    <h2 class="section-title">Despesas</h2>
    <div class="section-count">${expenses.length} despesas · Total: ${formatCurrency(total, baseCurrency)}</div>
  </div>

  <!-- Breakdown por categoria -->
  <div class="subsection-title">POR CATEGORIA</div>
  <div class="category-breakdown">
    ${categoryTotals.map(c => {
      const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
      const barWidth = Math.max(2, pct);
      return `
    <div class="cat-row">
      <div class="cat-emoji">${categoryEmoji(c.cat)}</div>
      <div class="cat-label-col">
        <div class="cat-name">${categoryLabel(c.cat)}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${barWidth}%"></div></div>
      </div>
      <div class="cat-amount-col">
        <div class="cat-amount">${formatCurrency(c.total, baseCurrency)}</div>
        <div class="cat-pct">${pct}%</div>
      </div>
    </div>`;
    }).join('')}
  </div>

  <!-- Lista de despesas -->
  <div class="subsection-title" style="margin-top:24pt">HISTÓRICO</div>
  <table class="expense-table">
    <thead>
      <tr>
        <th>DATA</th>
        <th>DESCRIÇÃO</th>
        <th>CATEGORIA</th>
        <th>PAGO POR</th>
        <th class="text-right">VALOR</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(e => `
      <tr>
        <td class="date-col">${formatDateBR((e.expense_date ?? '').split('T')[0])}</td>
        <td>${esc(e.description)}</td>
        <td class="cat-col">${categoryLabel(e.category)}</td>
        <td class="payer-col">${esc(memberMap[e.paid_by] ?? '—')}</td>
        <td class="amount-col">${formatCurrency(e.amount_in_base, baseCurrency)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="total-label">TOTAL</td>
        <td class="amount-col total-value">${formatCurrency(total, baseCurrency)}</td>
      </tr>
    </tfoot>
  </table>
</div>`;
}

// ─── Tarefas ──────────────────────────────────────────────────────

function buildTasksSection(tasks: TaskSummary[]): string {
  const done = tasks.filter(t => t.done);
  const pending = tasks.filter(t => !t.done);

  return `
<div class="page page-break">
  <div class="section-header">
    <div class="section-eyebrow">LISTA DE TAREFAS</div>
    <h2 class="section-title">Checklist</h2>
    <div class="section-count">${done.length}/${tasks.length} concluídas</div>
  </div>

  ${pending.length > 0 ? `
  <div class="subsection-title">PENDENTES</div>
  ${pending.map(t => `
  <div class="task-row pending">
    <div class="task-check-empty"></div>
    <div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      ${t.due_date ? `<div class="task-due">Vence em ${formatDateBR(t.due_date)}</div>` : ''}
    </div>
  </div>`).join('')}` : ''}

  ${done.length > 0 ? `
  <div class="subsection-title" style="margin-top:20pt">CONCLUÍDAS</div>
  ${done.map(t => `
  <div class="task-row done">
    <div class="task-check-done">✓</div>
    <div class="task-body">
      <div class="task-title done">${esc(t.title)}</div>
    </div>
  </div>`).join('')}` : ''}
</div>`;
}

// ─── Rodapé ───────────────────────────────────────────────────────

function buildFooter(title: string): string {
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  return `
<div class="footer">
  <div class="footer-divider"></div>
  <div class="footer-content">
    <span class="footer-trip">${esc(title)}</span>
    <span class="footer-app">Gerado pelo Trajet · ${now}</span>
  </div>
</div>`;
}

// ─── CSS ──────────────────────────────────────────────────────────

const TEAL = '#0d9488';
const TEAL_DARK = '#0f766e';
const TEAL_LIGHT = '#e6f7f5';

const CSS = `
/* ── Reset ── */
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  color: #1a1a2e;
  font-size: 10pt;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Página ── */
.page {
  padding: 36pt 40pt 36pt;
  max-width: 595pt;
}
.page-break { page-break-before: always; }

/* ── CAPA COM FOTO ── */
.cover-full {
  width: 100%;
  page-break-after: always;
  position: relative;
}
.cover-photo {
  display: block;
  width: 100%;
  height: 500pt;
  object-fit: cover;
  object-position: center;
}
.cover-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 80pt 40pt 40pt;
  background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 55%, transparent 100%);
}
.cover-label {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 4px;
  color: rgba(255,255,255,0.7);
  margin-bottom: 10pt;
}
.cover-title-img {
  font-size: 34pt;
  font-weight: 800;
  color: #fff;
  line-height: 1.05;
  letter-spacing: -0.5pt;
  margin-bottom: 8pt;
}
.cover-dates-img {
  font-size: 13pt;
  color: rgba(255,255,255,0.85);
  font-weight: 500;
}
.cover-desc-below {
  padding: 20pt 40pt;
  font-size: 11pt;
  color: #555;
  font-style: italic;
  text-align: center;
  background: #fafafa;
  border-bottom: 1px solid #eee;
}

/* ── CAPA TIPOGRÁFICA ── */
.cover-text {
  min-height: 842pt;
  display: -webkit-box;
  display: flex;
  page-break-after: always;
  background: #fff;
}
.cover-accent-bar {
  width: 8pt;
  background: ${TEAL};
  flex-shrink: 0;
}
.cover-text-content {
  flex: 1;
  padding: 120pt 48pt 60pt;
}
.cover-title-text {
  font-size: 42pt;
  font-weight: 900;
  color: #0a0a14;
  line-height: 1.0;
  letter-spacing: -1pt;
  margin-top: 16pt;
  margin-bottom: 20pt;
  word-break: break-word;
}
.cover-dates-text {
  font-size: 14pt;
  color: ${TEAL};
  font-weight: 700;
  letter-spacing: 1pt;
  margin-bottom: 24pt;
}
.cover-desc-text {
  font-size: 12pt;
  color: #555;
  font-style: italic;
  max-width: 380pt;
  line-height: 1.65;
}
.cover-decoration {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: center;
  align-items: center;
  gap: 0;
  margin-top: 48pt;
}
.cover-deco-line {
  height: 1pt;
  width: 60pt;
  background: #ddd;
}
.cover-deco-dot {
  width: 8pt;
  height: 8pt;
  border-radius: 50%;
  background: ${TEAL};
  margin: 0 12pt;
}

/* ── CABEÇALHO DE SEÇÃO ── */
.section-header {
  margin-bottom: 20pt;
  padding-bottom: 10pt;
  border-bottom: 2pt solid #0a0a14;
}
.section-eyebrow {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 3px;
  color: ${TEAL};
  margin-bottom: 4pt;
}
.section-title {
  font-size: 20pt;
  font-weight: 800;
  color: #0a0a14;
  letter-spacing: -0.3pt;
}
.section-count {
  font-size: 9pt;
  color: #888;
  margin-top: 3pt;
}
.subsection-title {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: #888;
  margin-bottom: 10pt;
  margin-top: 8pt;
}

/* ── STATS ── */
.stats-row {
  display: -webkit-box;
  display: flex;
  gap: 12pt;
  margin-bottom: 24pt;
  -webkit-box-pack: start;
  justify-content: flex-start;
}
.stat-card {
  -webkit-box-flex: 1;
  flex: 1;
  background: ${TEAL_LIGHT};
  border-left: 3pt solid ${TEAL};
  padding: 12pt 14pt;
  border-radius: 4pt;
}
.stat-value {
  font-size: 24pt;
  font-weight: 800;
  color: ${TEAL_DARK};
  line-height: 1;
  letter-spacing: -0.5pt;
}
.stat-label {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 2px;
  color: #555;
  margin-top: 3pt;
  text-transform: uppercase;
}
.summary-total-box {
  background: #0a0a14;
  color: #fff;
  padding: 16pt 20pt;
  border-radius: 6pt;
  margin-bottom: 24pt;
  display: -webkit-box;
  display: flex;
  -webkit-box-pack: justify;
  justify-content: space-between;
  -webkit-box-align: center;
  align-items: center;
}
.summary-total-label {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.65);
}
.summary-total-value {
  font-size: 22pt;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.3pt;
}

/* ── TIMELINE ── */
.timeline-section { margin-top: 4pt; }
.timeline-row {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: center;
  align-items: center;
  gap: 8pt;
  padding: 5pt 0;
  border-bottom: 1pt solid #f0f0f0;
}
.timeline-day {
  font-size: 7pt;
  font-weight: 800;
  color: ${TEAL};
  letter-spacing: 1.5px;
  min-width: 32pt;
  text-align: right;
}
.timeline-date {
  font-size: 8pt;
  color: #888;
  min-width: 50pt;
}
.timeline-bar {
  width: 1pt;
  height: 12pt;
  background: #e0e0e0;
  flex-shrink: 0;
}
.timeline-places {
  font-size: 9pt;
  color: #444;
  -webkit-box-flex: 1;
  flex: 1;
}

/* ── HOSPEDAGENS ── */
.lodging-card {
  border: 1pt solid #e8e8e8;
  border-radius: 6pt;
  padding: 14pt 16pt;
  margin-bottom: 12pt;
  page-break-inside: avoid;
  border-left: 4pt solid ${TEAL};
}
.lodging-kind {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 2px;
  color: ${TEAL};
  margin-bottom: 3pt;
}
.lodging-name {
  font-size: 13pt;
  font-weight: 700;
  color: #0a0a14;
  margin-bottom: 4pt;
}
.lodging-address {
  font-size: 9pt;
  color: #666;
  margin-bottom: 8pt;
}
.lodging-meta {
  display: -webkit-box;
  display: flex;
  -webkit-box-orient: horizontal;
  -webkit-box-direction: normal;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16pt;
  margin-top: 8pt;
  background: #f9f9f9;
  padding: 8pt 10pt;
  border-radius: 4pt;
}
.meta-item {
  font-size: 8pt;
  color: #555;
}
.meta-label {
  font-weight: 700;
  color: #888;
  font-size: 7pt;
  letter-spacing: 1px;
  margin-right: 3pt;
}
.lodging-notes {
  font-size: 9pt;
  color: #777;
  font-style: italic;
  margin-top: 8pt;
  padding-top: 8pt;
  border-top: 1pt solid #eee;
}

/* ── ROTEIRO ── */
.day-block {
  margin-bottom: 20pt;
  page-break-inside: avoid;
}
.day-header-row {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: flex-start;
  align-items: flex-start;
  gap: 12pt;
  margin-bottom: 10pt;
}
.day-number-badge {
  background: #0a0a14;
  color: #fff;
  font-size: 7pt;
  font-weight: 800;
  letter-spacing: 1.5px;
  padding: 4pt 8pt;
  border-radius: 3pt;
  white-space: nowrap;
  margin-top: 2pt;
  flex-shrink: 0;
}
.day-info { -webkit-box-flex: 1; flex: 1; }
.day-title {
  font-size: 12pt;
  font-weight: 700;
  color: #0a0a14;
  text-transform: capitalize;
}
.day-notes {
  font-size: 9pt;
  color: #777;
  font-style: italic;
  margin-top: 2pt;
}
.day-empty {
  font-size: 9pt;
  color: #bbb;
  font-style: italic;
  padding: 8pt 0;
  margin-left: 48pt;
}

/* ── ITEMS DO ROTEIRO ── */
.item-row {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: flex-start;
  align-items: flex-start;
  gap: 10pt;
  padding: 7pt 0;
  border-bottom: 1pt dotted #ebebeb;
  page-break-inside: avoid;
}
.item-row:last-child { border-bottom: none; }
.item-time {
  font-size: 9pt;
  font-weight: 700;
  color: ${TEAL};
  width: 32pt;
  flex-shrink: 0;
  margin-top: 1pt;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
.item-divider {
  width: 1pt;
  background: #e0e0e0;
  align-self: stretch;
  flex-shrink: 0;
}
.item-body { -webkit-box-flex: 1; flex: 1; }
.item-name {
  font-size: 10pt;
  font-weight: 600;
  color: #0a0a14;
  margin-bottom: 1pt;
}
.item-addr {
  font-size: 8pt;
  color: #888;
  margin-top: 2pt;
}
.item-note {
  font-size: 8pt;
  color: #888;
  font-style: italic;
  margin-top: 2pt;
}
.item-duration {
  font-size: 8pt;
  color: #aaa;
  margin-top: 2pt;
}

/* ── DESPESAS ── */
.category-breakdown { margin-bottom: 20pt; }
.cat-row {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: center;
  align-items: center;
  gap: 10pt;
  padding: 7pt 0;
  border-bottom: 1pt solid #f5f5f5;
}
.cat-emoji { font-size: 14pt; width: 18pt; text-align: center; flex-shrink: 0; }
.cat-label-col { -webkit-box-flex: 1; flex: 1; }
.cat-name { font-size: 9pt; font-weight: 600; color: #333; margin-bottom: 3pt; }
.cat-bar-track {
  height: 4pt;
  background: #f0f0f0;
  border-radius: 2pt;
  overflow: hidden;
}
.cat-bar-fill {
  height: 100%;
  background: ${TEAL};
  border-radius: 2pt;
}
.cat-amount-col { text-align: right; flex-shrink: 0; min-width: 70pt; }
.cat-amount { font-size: 9pt; font-weight: 700; color: #0a0a14; }
.cat-pct { font-size: 8pt; color: #999; }

.expense-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.expense-table thead th {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #888;
  text-transform: uppercase;
  padding: 8pt 6pt 6pt;
  border-bottom: 2pt solid #0a0a14;
  text-align: left;
}
.expense-table tbody td {
  padding: 6pt;
  border-bottom: 1pt solid #f2f2f2;
  color: #333;
  vertical-align: top;
}
.expense-table tbody tr:nth-child(even) td {
  background: #fafafa;
}
.text-right, .amount-col { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.date-col { color: #888; white-space: nowrap; font-size: 8pt; }
.cat-col { font-size: 8pt; color: #666; }
.payer-col { font-size: 8pt; color: #555; }
.expense-table tfoot td {
  padding: 10pt 6pt 4pt;
  border-top: 2pt solid #0a0a14;
  font-weight: 700;
  font-size: 10pt;
}
.total-label { color: #888; font-size: 8pt; letter-spacing: 1px; }
.total-value { font-size: 13pt; color: #0a0a14; }

/* ── TAREFAS ── */
.task-row {
  display: -webkit-box;
  display: flex;
  -webkit-box-align: flex-start;
  align-items: flex-start;
  gap: 10pt;
  padding: 7pt 0;
  border-bottom: 1pt solid #f5f5f5;
  page-break-inside: avoid;
}
.task-check-empty {
  width: 12pt;
  height: 12pt;
  border: 1.5pt solid #ccc;
  border-radius: 3pt;
  flex-shrink: 0;
  margin-top: 1pt;
}
.task-check-done {
  width: 12pt;
  height: 12pt;
  background: ${TEAL};
  border: 1.5pt solid ${TEAL};
  border-radius: 3pt;
  flex-shrink: 0;
  margin-top: 1pt;
  color: #fff;
  font-size: 8pt;
  font-weight: 700;
  text-align: center;
  line-height: 10pt;
}
.task-body { -webkit-box-flex: 1; flex: 1; }
.task-title { font-size: 10pt; font-weight: 500; color: #1a1a2e; }
.task-title.done { text-decoration: line-through; color: #bbb; font-weight: 400; }
.task-due { font-size: 8pt; color: #aaa; margin-top: 2pt; }

/* ── RODAPÉ ── */
.footer {
  margin-top: 40pt;
  padding: 0 40pt 32pt;
}
.footer-divider {
  height: 1pt;
  background: linear-gradient(to right, ${TEAL}, #ddd);
  margin-bottom: 10pt;
}
.footer-content {
  display: -webkit-box;
  display: flex;
  -webkit-box-pack: justify;
  justify-content: space-between;
  -webkit-box-align: center;
  align-items: center;
}
.footer-trip {
  font-size: 8pt;
  font-weight: 700;
  color: #333;
  letter-spacing: 0.5px;
}
.footer-app {
  font-size: 7pt;
  color: #aaa;
  letter-spacing: 0.5px;
}
`;
