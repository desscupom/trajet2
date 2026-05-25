// Helpers de data centralizados.
// O Postgres armazena datas como 'AAAA-MM-DD' (sem timezone).
// Pra evitar bug de fuso ao parsear, sempre forçamos meio-dia local.

export function parseDbDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

export function toDbDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** dd/mm/aaaa */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbDate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** dd/mm — versão curta sem ano */
export function formatDateShortBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbDate(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** Qua, 14/06 */
export function formatDateLongBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseDbDate(iso);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekday.replace('.', '')}, ${day}/${month}`;
}

/** HH:MM (24h) */
export function formatTimeBR(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** dd/mm/aaaa HH:MM */
export function formatDateTimeBR(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/** dd/mm → dd/mm ou dd/mm/aaaa → dd/mm/aaaa */
export function formatDateRangeBR(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) return '';
  if (start && end) return `${formatDateBR(start)} → ${formatDateBR(end)}`;
  if (start) return `A partir de ${formatDateBR(start)}`;
  return `Até ${formatDateBR(end!)}`;
}

/** dd/mm → dd/mm (sem ano quando mesmo ano) */
export function formatDateRangeCompact(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) return '';
  if (!end) return formatDateShortBR(start);
  if (!start) return formatDateShortBR(end);
  const s = parseDbDate(start);
  const e = parseDbDate(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear) {
    return `${formatDateShortBR(start)} – ${formatDateShortBR(end)}`;
  }
  return `${formatDateBR(start)} – ${formatDateBR(end)}`;
}

// Gera array de datas (AAAA-MM-DD) entre start e end, inclusivos.
export function datesBetween(start: string, end: string): string[] {
  const startDate = parseDbDate(start);
  const endDate = parseDbDate(end);
  const out: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    out.push(toDbDate(current));
    current.setDate(current.getDate() + 1);
  }
  return out;
}

export function getTripStatus(
  start: string | null | undefined,
  end: string | null | undefined
): {
  status: 'upcoming' | 'ongoing' | 'past' | 'planning';
  daysUntil: number | null;
  countdownLabel: string | null;
} {
  if (!start || !end) {
    return { status: 'planning', daysUntil: null, countdownLabel: null };
  }
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const startDate = parseDbDate(start);
  const endDate = parseDbDate(end);
  const msPerDay = 1000 * 60 * 60 * 24;

  if (now < startDate) {
    const daysUntil = Math.ceil((startDate.getTime() - now.getTime()) / msPerDay);
    let label: string;
    if (daysUntil === 1) label = 'amanhã';
    else if (daysUntil <= 7) label = `em ${daysUntil} dias`;
    else if (daysUntil <= 30) {
      const weeks = Math.ceil(daysUntil / 7);
      label = `em ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
    } else {
      const months = Math.round(daysUntil / 30);
      label = `em ${months} ${months === 1 ? 'mês' : 'meses'}`;
    }
    return { status: 'upcoming', daysUntil, countdownLabel: label };
  }

  if (now >= startDate && now <= endDate) {
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / msPerDay);
    return {
      status: 'ongoing',
      daysUntil: 0,
      countdownLabel: daysLeft <= 1 ? 'último dia' : `${daysLeft} dias restantes`,
    };
  }

  const daysAgo = Math.floor((now.getTime() - endDate.getTime()) / msPerDay);
  return { status: 'past', daysUntil: -daysAgo, countdownLabel: 'finalizada' };
}

