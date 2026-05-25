import { useEffect, useRef } from 'react';

import { useToast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { getPrefsForCurrentUser } from '@/hooks/useNotificationPreferences';
import { supabase } from '@/lib/supabase';

/**
 * Escuta INSERTs em places, expenses e trip_members das viagens em que
 * o usuário atual é membro e mostra um toast quando OUTRA pessoa faz
 * a alteração. Respeita as preferências de notificação:
 * - notifications_enabled (master)
 * - trip_edits (places + itinerary_items)
 * - expense_added
 * - member_joined
 *
 * Roda quando logado. Apenas in-app — push remoto vem depois (precisa dev build).
 */
export function useTripActivityNotifications() {
  const { user } = useAuth();
  const toast = useToast();
  // Mantém ref do toast pra usar dentro do callback sem re-subscribing
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let placesChannel: ReturnType<typeof supabase.channel> | null = null;
    let expensesChannel: ReturnType<typeof supabase.channel> | null = null;
    let membersChannel: ReturnType<typeof supabase.channel> | null = null;
    let itineraryChannel: ReturnType<typeof supabase.channel> | null = null;
    let lodgingsChannel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      // 1. Pega as viagens das quais user é membro
      const { data: memberships } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('profile_id', user!.id);

      if (cancelled || !memberships || memberships.length === 0) return;
      const tripIds = memberships.map((m) => m.trip_id);

      // 2. Cache de títulos das viagens (pra usar no toast)
      const { data: trips } = await supabase
        .from('trips')
        .select('id, title')
        .in('id', tripIds);
      const tripTitleById = new Map(trips?.map((t) => [t.id, t.title]) ?? []);

      // 3. Helper que checa preferências antes de notificar
      async function shouldNotify(
        type: 'trip_edits' | 'expense_added' | 'member_joined'
      ): Promise<boolean> {
        const { prefs } = await getPrefsForCurrentUser();
        if (!prefs?.notifications_enabled) return false;
        return prefs[type] === true;
      }

      // 4. Cache de profile names (pra mostrar "X adicionou Y")
      async function getProfileName(profileId: string): Promise<string> {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', profileId)
          .maybeSingle();
        const name = (data?.full_name ?? '').split(' ')[0] || data?.email || 'Alguém';
        return name;
      }

      // 5. Subscribe places (atividade do roteiro)
      placesChannel = supabase
        .channel(`activity-places-${user!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'places',
            filter: `trip_id=in.(${tripIds.join(',')})`,
          },
          async (payload) => {
            const place = payload.new as {
              created_by: string | null;
              name: string;
              trip_id: string;
            };
            if (!place.created_by || place.created_by === user!.id) return;
            if (!(await shouldNotify('trip_edits'))) return;

            const author = await getProfileName(place.created_by);
            const trip = tripTitleById.get(place.trip_id) ?? 'a viagem';
            toastRef.current.info(
              `${author} adicionou “${place.name}” em ${trip}`
            );
          }
        )
        .subscribe();

      // 6. Subscribe itinerary_items (rearranjo do roteiro)
      itineraryChannel = supabase
        .channel(`activity-itinerary-${user!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'itinerary_items',
          },
          async (payload) => {
            const item = payload.new as {
              created_by: string | null;
              trip_day_id: string;
            };
            if (!item.created_by || item.created_by === user!.id) return;
            if (!(await shouldNotify('trip_edits'))) return;

            // Verifica se esse trip_day pertence a uma das viagens do user
            const { data: dayData } = await supabase
              .from('trip_days')
              .select('trip_id')
              .eq('id', item.trip_day_id)
              .maybeSingle();
            if (!dayData || !tripIds.includes(dayData.trip_id)) return;

            const author = await getProfileName(item.created_by);
            const trip = tripTitleById.get(dayData.trip_id) ?? 'a viagem';
            toastRef.current.info(`${author} editou o roteiro de ${trip}`);
          }
        )
        .subscribe();

      // 7. Subscribe expenses
      expensesChannel = supabase
        .channel(`activity-expenses-${user!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'expenses',
            filter: `trip_id=in.(${tripIds.join(',')})`,
          },
          async (payload) => {
            const expense = payload.new as {
              paid_by: string;
              description: string;
              trip_id: string;
            };
            if (expense.paid_by === user!.id) return;
            if (!(await shouldNotify('expense_added'))) return;

            const author = await getProfileName(expense.paid_by);
            const trip = tripTitleById.get(expense.trip_id) ?? 'a viagem';
            toastRef.current.info(
              `${author} adicionou “${expense.description}” em ${trip}`
            );
          }
        )
        .subscribe();

      // 8. Subscribe trip_members (novo membro)
      membersChannel = supabase
        .channel(`activity-members-${user!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'trip_members',
            filter: `trip_id=in.(${tripIds.join(',')})`,
          },
          async (payload) => {
            const member = payload.new as {
              profile_id: string;
              trip_id: string;
            };
            if (member.profile_id === user!.id) return;
            if (!(await shouldNotify('member_joined'))) return;

            const author = await getProfileName(member.profile_id);
            const trip = tripTitleById.get(member.trip_id) ?? 'a viagem';
            toastRef.current.info(`${author} entrou em ${trip}`);
          }
        )
        .subscribe();

      // 9. Subscribe lodgings (categorizado como trip_edits — alteração da viagem)
      lodgingsChannel = supabase
        .channel(`activity-lodgings-${user!.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'lodgings',
            filter: `trip_id=in.(${tripIds.join(',')})`,
          },
          async (payload) => {
            const lodging = payload.new as {
              created_by: string | null;
              name: string;
              trip_id: string;
            };
            if (!lodging.created_by || lodging.created_by === user!.id) return;
            if (!(await shouldNotify('trip_edits'))) return;

            const author = await getProfileName(lodging.created_by);
            const trip = tripTitleById.get(lodging.trip_id) ?? 'a viagem';
            toastRef.current.info(
              `${author} adicionou “${lodging.name}” em ${trip}`
            );
          }
        )
        .subscribe();
    }

    setup();

    return () => {
      cancelled = true;
      if (placesChannel) supabase.removeChannel(placesChannel);
      if (expensesChannel) supabase.removeChannel(expensesChannel);
      if (membersChannel) supabase.removeChannel(membersChannel);
      if (itineraryChannel) supabase.removeChannel(itineraryChannel);
      if (lodgingsChannel) supabase.removeChannel(lodgingsChannel);
    };
  }, [user?.id]);
}
