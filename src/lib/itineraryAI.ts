import { callOpenAI } from '@/lib/openaiClient';
import type { ItineraryItem } from '@/components/trip/types';

// ── #10: Resumo do dia ───────────────────────────────────────────

export async function generateDaySummary(
  dayDate: string,
  dayIndex: number,
  destination: string,
  items: ItineraryItem[],
): Promise<string> {
  const placeList = items
    .map((it, i) => {
      const name = it.place?.name || it.custom_title || 'Lugar';
      const time = it.start_time ? ` às ${it.start_time.slice(0, 5)}` : '';
      const cat = it.place?.category ? ` (${it.place.category})` : '';
      return `${i + 1}. ${name}${time}${cat}`;
    })
    .join('\n');

  const prompt = `Escreva um resumo narrativo bonito e encorajador para o Dia ${dayIndex + 1} de viagem em ${destination || 'destino a definir'}.

Lugares do dia:
${placeList || 'Nenhum lugar definido ainda.'}

Escreva em português do Brasil, 2-3 frases, tom animado e poético, como um guia de viagem entusiasmado. 
Mencione os lugares e horários de forma natural. Não repita a lista de lugares literalmente.
Retorne apenas o texto, sem título, sem marcadores.`;

  return await callOpenAI({
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'text' },
    temperature: 0.8,
    max_tokens: 200,
  });
}

// ── #11: Detecção de conflitos ───────────────────────────────────

export type Conflict = {
  type: 'time_overlap' | 'distance' | 'day_too_full' | 'no_time';
  severity: 'warning' | 'info';
  message: string;
  itemIds: string[];
};

const AVG_SPEED_KMH = 30; // velocidade média em cidade (trânsito + a pé)

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectConflicts(items: ItineraryItem[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const sorted = [...items].filter((it) => it.start_time).sort((a, b) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? ''),
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];

    const currStart = curr.start_time!;
    const currDur = curr.duration_minutes ?? 60;
    const [ch, cm] = (currStart ?? '00:00').split(':').map(Number);
    const currEndMin = ch * 60 + cm + currDur;

    const [nh, nm] = (next.start_time ?? '00:00').split(':').map(Number);
    const nextStartMin = nh * 60 + nm;

    // Conflito de horário
    if (currEndMin > nextStartMin) {
      conflicts.push({
        type: 'time_overlap',
        severity: 'warning',
        message: `"${curr.place?.name || curr.custom_title}" termina depois de "${next.place?.name || next.custom_title}" começar.`,
        itemIds: [curr.id, next.id],
      });
    }

    // Conflito de distância
    const currLat = curr.place?.latitude;
    const currLon = curr.place?.longitude;
    const nextLat = next.place?.latitude;
    const nextLon = next.place?.longitude;

    if (currLat && currLon && nextLat && nextLon) {
      const km = haversineKm(currLat, currLon, nextLat, nextLon);
      const transitMin = (km / AVG_SPEED_KMH) * 60;
      const availableMin = nextStartMin - currEndMin;

      if (km > 15 && availableMin < transitMin + 10) {
        conflicts.push({
          type: 'distance',
          severity: 'warning',
          message: `${km.toFixed(0)} km entre "${curr.place?.name || curr.custom_title}" e "${next.place?.name || next.custom_title}". Trânsito estimado: ~${Math.round(transitMin)} min.`,
          itemIds: [curr.id, next.id],
        });
      }
    }
  }

  // Dia muito cheio (mais de 6 lugares)
  if (items.length > 6) {
    conflicts.push({
      type: 'day_too_full',
      severity: 'info',
      message: `${items.length} lugares em um dia pode ser cansativo. Considere distribuir alguns para outros dias.`,
      itemIds: [],
    });
  }

  return conflicts;
}

// ── #12: Sugestão de orçamento baseada no roteiro ───────────────

export async function suggestBudgetForItinerary(
  destination: string,
  days: { date: string; items: ItineraryItem[] }[],
  currency: string,
): Promise<{ category: string; emoji: string; amount: number; note: string }[]> {
  const daysSummary = days
    .slice(0, 5) // max 5 dias no prompt
    .map((d, i) => {
      const places = d.items.map((it) => it.place?.name || it.custom_title).filter(Boolean);
      return `Dia ${i + 1}: ${places.join(', ') || 'sem lugares'}`;
    })
    .join('\n');

  const raw = await callOpenAI({
    messages: [
      {
        role: 'user',
        content: `Baseado neste roteiro em ${destination}, estime os gastos em ${currency}.

${daysSummary}

Retorne JSON com array de objetos:
[{"category":"alimentação","emoji":"🍽️","amount":450,"note":"restaurantes médios, 3 refeições/dia"},...]

Retorne JSON no formato: {"items": [...]}
Categorias obrigatórias: alimentação, transporte_local, passeios_entradas, compras_souvenirs, extras.
Valores realistas em ${currency}.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 400,
  });

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed) ? parsed : parsed.items ?? [];
  } catch {
    return [];
  }
}

// ── #13: Tarefas automáticas por destino ───────────────────────

export type SuggestedTask = {
  title: string;
  category: 'documento' | 'saude' | 'financeiro' | 'compras' | 'logistica';
  emoji: string;
  priority: 'alta' | 'media' | 'baixa';
};

export async function generateTravelChecklist(
  destination: string,
  startDate: string | null,
  daysCount: number,
): Promise<SuggestedTask[]> {
  const daysUntil = startDate
    ? Math.ceil((new Date(startDate).getTime() - Date.now()) / 86400000)
    : null;

  const raw = await callOpenAI({
    messages: [
      {
        role: 'user',
        content: `Gere um checklist de preparação para viagem a ${destination}, ${daysCount} dias.
${daysUntil ? `A viagem começa em ${daysUntil} dias.` : ''}

Retorne JSON com array de tarefas:
[{"title":"Verificar validade do passaporte","category":"documento","emoji":"🛂","priority":"alta"},...]

Gere 8-12 tarefas ESPECÍFICAS para ${destination} (documentos, saúde, financeiro, compras, logística).
Prioridades: alta (urgente/obrigatório), media (importante), baixa (opcional).
Retorne apenas JSON no formato: {"tasks": [...]}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 600,
  });

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed) ? parsed : parsed.tasks ?? parsed.items ?? [];
  } catch {
    return [];
  }
}
