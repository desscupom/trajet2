import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

/**
 * Sincroniza foto e nome do perfil OAuth (Google/Apple) para a tabela profiles.
 * O trigger handle_new_user cuida de novos usuários,
 * mas usuários existentes precisam desta atualização quando fazem login.
 */
async function syncOAuthProfile(user: User) {
  const meta = user.user_metadata ?? {};
  const provider = user.app_metadata?.provider;

  // Só sincroniza para OAuth (Google, Apple)
  if (!provider || provider === 'email') return;

  const avatarUrl =
    meta.avatar_url ||
    meta.picture ||      // Google
    meta.avatar ||
    meta.photo_url ||
    null;

  const fullName =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    null;

  if (!avatarUrl && !fullName) return;

  // Só atualiza campos que estão vazios no perfil (não sobrescreve o que o usuário já editou)
  const { data: existing } = await supabase
    .from('profiles')
    .select('avatar_url, full_name')
    .eq('id', user.id)
    .single();

  const updates: Record<string, string> = {};
  if (!existing?.avatar_url && avatarUrl) updates.avatar_url = avatarUrl;
  if (!existing?.full_name && fullName) updates.full_name = fullName;

  if (Object.keys(updates).length > 0) {
    await supabase.from('profiles').update(updates as any).eq('id', user.id);
  }
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        syncOAuthProfile(data.session.user).catch(() => {});
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          syncOAuthProfile(newSession.user).catch(() => {});
        }
      }
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
  };
}
