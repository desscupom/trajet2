/**
 * useAssistantContext — busca e monta o contexto completo da viagem
 * para o TripAssistantModal. Inclui: roteiro, hospedagens, despesas,
 * tarefas, transportes, rota de carro e clima.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '@/types/assistant';

type Props = {
  tripId: string;
  userId: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
};

export function useAssistantContext({ tripId, userId, setMessages }: Props) {
  const [context, setContext] = useState('');
  const [contextLoading, setContextLoading] = useState(true);

  async function buildContext() {
    setContextLoading(true);
    try {
      const [tripR, daysR, lodgingsR, expR, tasksR, sharesR, transportsR, routeR, weatherR, membersR] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).single(),
        supabase.from('trip_days').select('id, day_date, position, weather_summary, weather_icon, weather_temp_min, weather_temp_max').eq('trip_id', tripId).order('position'),
        supabase.from('lodgings').select('name, kind, check_in_at, check_out_at, address, reservation_code, cost_amount, cost_currency').eq('trip_id', tripId),
        supabase.from('expenses').select('id, description, amount, amount_in_base, currency, category, paid_by, expense_date').eq('trip_id', tripId) as any,
        supabase.from('tasks').select('title, done, due_date, priority, category').eq('trip_id', tripId).eq('done', false),
        (supabase as any).from('expense_shares').select('expense_id, share_amount, settled_at').eq('profile_id', userId ?? '').is('settled_at', null),
        (supabase as any).from('transports').select('type, origin_name, origin_code, destination_name, destination_code, departs_at, arrives_at, arrives_at, operator, number, reservation_code, cost_amount, cost_currency, platform').eq('trip_id', tripId).order('departs_at'),
        (supabase as any).from('trip_route').select('total_km, total_duration_minutes, estimated_fuel_cost, estimated_toll_cost, fuel_efficiency, fuel_price_per_liter').eq('trip_id', tripId).single(),
        (supabase as any).from('weather_alerts').select('day_date, description, severity').eq('trip_id', tripId).order('day_date'),
        supabase.from('trip_members').select('profile_id, profiles:profile_id(full_name, email)').eq('trip_id', tripId),
      ]);

      const tripData = tripR.data;
      const days = daysR.data ?? [];

      // ── Roteiro ────────────────────────────────────────────────
      let itineraryLines: string[] = [];
      if (days.length > 0) {
        const dayIds = days.map((d: any) => d.id);
        const { data: items } = await supabase
          .from('itinerary_items')
          .select('trip_day_id, custom_title, start_time, duration_minutes, notes, place:places(name, category, address)')
          .in('trip_day_id', dayIds).order('start_time');
        days.forEach((day: any, i: number) => {
          const dayItems = (items ?? []).filter((it: any) => it.trip_day_id === day.id);
          const weatherStr = day.weather_icon
            ? ` [${day.weather_icon} ${day.weather_temp_min ?? '?'}°–${day.weather_temp_max ?? '?'}°]`
            : '';
          itineraryLines.push(`Dia ${i + 1} (${day.day_date})${weatherStr}:`);
          if (dayItems.length === 0) {
            itineraryLines.push('  (sem itens)');
          } else {
            dayItems.forEach((it: any) => {
              const name = (it as any).place?.name ?? it.custom_title ?? 'Lugar';
              const time = it.start_time ? ` às ${it.start_time.slice(0, 5)}` : '';
              const dur = it.duration_minutes ? ` (${it.duration_minutes}min)` : '';
              const note = it.notes ? ` — ${it.notes.slice(0, 60)}` : '';
              itineraryLines.push(`  - ${name}${time}${dur}${note}`);
            });
          }
        });
      }

      // ── Hospedagens ────────────────────────────────────────────
      const lodgingLines = (lodgingsR.data ?? []).map((l: any) => {
        const checkin = l.check_in_at?.slice(0, 10) ?? '?';
        const checkout = l.check_out_at?.slice(0, 10) ?? '?';
        const code = l.reservation_code ? ` | Reserva: ${l.reservation_code}` : '';
        const cost = l.cost_amount ? ` | Custo: ${l.cost_currency ?? ''} ${l.cost_amount}` : '';
        return `${l.name} (${l.kind}) — Check-in: ${checkin} / Check-out: ${checkout}${code}${cost}${l.address ? ` | ${l.address}` : ''}`;
      });

      // ── Despesas ───────────────────────────────────────────────
      const expenses: any[] = expR.data ?? [];
      const totalExpenses = expenses.reduce((s: number, e: any) => s + (e.amount_in_base ?? 0), 0);
      const expByCategory: Record<string, number> = {};
      expenses.forEach((e: any) => {
        const cat = e.category ?? 'outros';
        expByCategory[cat] = (expByCategory[cat] ?? 0) + (e.amount_in_base ?? 0);
      });
      const myPaid = expenses.filter((e: any) => e.paid_by === userId);
      const myPaidTotal = myPaid.reduce((s: number, e: any) => s + (e.amount_in_base ?? 0), 0);
      const pendingShares = (sharesR.data ?? []).filter((s: any) => !s.settled_at);
      const totalOwed = pendingShares.reduce((s: number, sh: any) => s + (sh.share_amount ?? 0), 0);

      // ── Transportes ────────────────────────────────────────────
      const iconMap: Record<string, string> = {
        flight: '✈️', bus: '🚌', train: '🚆', car: '🚗', ferry: '⛴️',
        subway: '🚇', taxi: '🚕', rideshare: '🚙', other: '🚀',
      };
      const transportLines = (transportsR.data ?? []).map((t: any) => {
        const icon = iconMap[t.type] ?? '🚀';
        const dep = t.departs_at
          ? new Date(t.departs_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            + ' ' + new Date(t.departs_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '';
        const arr = t.arrives_at
          ? new Date(t.arrives_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '';
        const code = t.reservation_code ? ` | Reserva: ${t.reservation_code}` : '';
        const cost = t.cost_amount ? ` | ${t.cost_currency ?? ''} ${t.cost_amount}` : '';
        const platform = t.platform ? ` | Plataforma/Gate: ${t.platform}` : '';
        return `${icon} ${t.origin_name}${t.origin_code ? ' (' + t.origin_code + ')' : ''} → ${t.destination_name}${t.destination_code ? ' (' + t.destination_code + ')' : ''}${dep ? ' · Partida: ' + dep : ''}${arr ? ' · Chegada: ' + arr : ''}${t.number ? ' · ' + t.number : ''}${t.operator ? ' (' + t.operator + ')' : ''}${code}${cost}${platform}`;
      });

      // ── Rota de carro ─────────────────────────────────────────
      const routeLines: string[] = [];
      if (routeR.data) {
        const r = routeR.data;
        if (r.total_km) routeLines.push(`Distância total: ${r.total_km} km`);
        if (r.total_duration_minutes) routeLines.push(`Tempo estimado: ${Math.floor(r.total_duration_minutes / 60)}h${r.total_duration_minutes % 60}min`);
        if (r.fuel_efficiency) routeLines.push(`Consumo: ${r.fuel_efficiency} km/L`);
        if (r.fuel_price_per_liter) routeLines.push(`Gasolina: R$ ${r.fuel_price_per_liter}/L`);
        if (r.estimated_toll_cost) routeLines.push(`Pedágios estimados: R$ ${r.estimated_toll_cost}`);
        if (r.total_km && r.fuel_efficiency && r.fuel_price_per_liter) {
          routeLines.push(`Custo combustível calculado: R$ ${((r.total_km / r.fuel_efficiency) * r.fuel_price_per_liter).toFixed(0)}`);
        }
      }

      // ── Clima / alertas ───────────────────────────────────────
      const weatherAlerts = (weatherR.data ?? []).map((w: any) =>
        `${w.day_date}: ${w.description} (severidade ${w.severity})`
      );
      const daysWithWeather = days.filter((d: any) => d.weather_icon);
      const climaLines = daysWithWeather.map((d: any) =>
        `${d.day_date}: ${d.weather_icon ?? ''} ${d.weather_summary ?? ''} ${d.weather_temp_min ?? '?'}°–${d.weather_temp_max ?? '?'}°`
      );

      // ── Membros ───────────────────────────────────────────────
      const memberNames = (membersR.data ?? [])
        .map((m: any) => m.profiles?.full_name || m.profiles?.email || m.profile_id)
        .filter(Boolean);

      // ── Tarefas ───────────────────────────────────────────────
      const taskLines = (tasksR.data ?? []).map((t: any) => {
        const prio = t.priority && t.priority !== 'normal' ? ` [${t.priority}]` : '';
        const cat = t.category ? ` (${t.category})` : '';
        const prazo = t.due_date ? ` — prazo: ${t.due_date}` : '';
        return `- ${t.title}${prio}${cat}${prazo}`;
      });

      // ── Monta contexto final ──────────────────────────────────
      const ctx = [
        `Viagem: "${tripData?.title}"`,
        tripData?.start_date ? `Período: ${tripData.start_date} a ${tripData?.end_date ?? '?'} (${days.length} dias)` : '',
        tripData?.description ? `Descrição: ${tripData.description}` : '',
        memberNames.length > 0 ? `Membros: ${memberNames.join(', ')}` : '',
        '',
        '=== MEIOS DE TRANSPORTE DA VIAGEM ===',
        (tripData as any)?.transport_modes?.length
          ? `Modos: ${((tripData as any).transport_modes as string[]).join(', ')} (principal: ${(tripData as any).primary_transport ?? 'não definido'})`
          : '',
        '',
        '=== ROTEIRO ===',
        itineraryLines.length > 0 ? itineraryLines.join('\n') : 'Roteiro ainda não definido.',
        '',
        '=== HOSPEDAGENS ===',
        lodgingLines.length > 0 ? lodgingLines.join('\n') : 'Nenhuma hospedagem cadastrada.',
        '',
        '=== TRANSPORTES CADASTRADOS ===',
        transportLines.length > 0 ? transportLines.join('\n') : 'Nenhum transporte cadastrado.',
        routeLines.length > 0 ? '\n=== ROTA DE CARRO ===\n' + routeLines.join('\n') : '',
        '',
        '=== CLIMA PREVISTO ===',
        climaLines.length > 0 ? climaLines.join('\n') : 'Sem dados de clima disponíveis.',
        weatherAlerts.length > 0 ? '\nAlertas meteorológicos:\n' + weatherAlerts.join('\n') : '',
        '',
        '=== DESPESAS DA VIAGEM ===',
        totalExpenses > 0
          ? `Total: ${tripData?.base_currency ?? 'BRL'} ${totalExpenses.toFixed(2)}\nPor categoria: ${Object.entries(expByCategory).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(', ')}`
          : 'Nenhuma despesa registrada.',
        '',
        '=== MINHA SITUAÇÃO FINANCEIRA ===',
        `Eu paguei: ${tripData?.base_currency ?? 'BRL'} ${myPaidTotal.toFixed(2)} em ${myPaid.length} despesa(s)`,
        totalOwed > 0 ? `⚠️ Eu devo: ${tripData?.base_currency ?? 'BRL'} ${totalOwed.toFixed(2)}` : 'Não devo nada.',
        '',
        '=== TAREFAS PENDENTES ===',
        taskLines.length > 0 ? taskLines.join('\n') : 'Nenhuma tarefa pendente.',
      ].filter(Boolean).join('\n');

      setContext(ctx);

      const savedRaw = await AsyncStorage.getItem(`trajet:assistant:${tripId}`).catch(() => null);
      const hasSaved = savedRaw && JSON.parse(savedRaw).length > 1;
      if (!hasSaved) {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: `Olá! Sou seu assistente para **${tripData?.title}**. Conheço o roteiro completo, hospedagens, transportes, despesas, clima e tarefas. Como posso ajudar?`,
        }]);
      }
    } catch (e) {
      console.error('buildContext error:', e);
      setContext('');
    } finally {
      setContextLoading(false);
    }
  }

  return { context, contextLoading, buildContext };
}
