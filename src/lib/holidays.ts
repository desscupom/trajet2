/**
 * Feriados nacionais brasileiros — fixos e móveis (baseados na Páscoa).
 */

function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getBrazilianHolidays(year: number): Set<string> {
  const e = easter(year);
  return new Set<string>([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`,
    `${year}-09-07`, `${year}-10-12`, `${year}-11-02`,
    `${year}-11-15`, `${year}-12-25`,
    fmt(addDays(e, -48)), fmt(addDays(e, -47)),
    fmt(addDays(e, -2)), fmt(e), fmt(addDays(e, 60)),
  ]);
}

export function getHolidayName(dateStr: string): string | null {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const e = easter(year);
  const names: Record<string, string> = {
    [`${year}-01-01`]: 'Confraternização Universal',
    [`${year}-04-21`]: 'Tiradentes',
    [`${year}-05-01`]: 'Dia do Trabalho',
    [`${year}-09-07`]: 'Independência do Brasil',
    [`${year}-10-12`]: 'Nossa Sra. Aparecida',
    [`${year}-11-02`]: 'Finados',
    [`${year}-11-15`]: 'Proclamação da República',
    [`${year}-12-25`]: 'Natal',
    [fmt(addDays(e, -48))]: 'Carnaval',
    [fmt(addDays(e, -47))]: 'Carnaval',
    [fmt(addDays(e, -2))]: 'Sexta-feira Santa',
    [fmt(e)]: 'Páscoa',
    [fmt(addDays(e, 60))]: 'Corpus Christi',
  };
  return names[dateStr] ?? null;
}

export function isHoliday(dateStr: string): boolean {
  return getBrazilianHolidays(parseInt(dateStr.slice(0, 4), 10)).has(dateStr);
}
