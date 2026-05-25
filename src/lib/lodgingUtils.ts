/**
 * Utilitários de data/hora para o LodgingModal.
 * Extraídos para reutilização e para reduzir o tamanho do modal.
 */

/** Combina data (YYYY-MM-DD) + hora (HH:mm) em ISO local */
export function combineDateTime(
  date: string | null,
  time: string,
  defaultHour: number = 14
): string | null {
  if (!date) return null;
  const [h, m] = time ? (time ?? '00:00').split(':').map(Number) : [defaultHour, 0];
  const d = new Date(date + 'T12:00:00'); // noon para evitar DST
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Extrai HH:mm de um ISO ou retorna string vazia */
export function extractTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Extrai YYYY-MM-DD de um ISO, usando timezone local */
export function extractDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
