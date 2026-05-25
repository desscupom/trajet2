import { useEffect, useState } from 'react';

import { fetchCoverSuggestions, fetchTripCoverUrl } from '@/lib/coverPhoto';

/**
 * Hook que retorna a URL da capa de uma viagem.
 *
 * Prioridades:
 * 1. customUrl (upload do user) — síncrono, retorna imediatamente
 * 2. Pexels via cache no Supabase / API
 *
 * Retorna `null` enquanto está buscando.
 */
export function useCoverPhoto(
  title: string | null | undefined,
  customUrl: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(customUrl ?? null);

  useEffect(() => {
    let cancelled = false;

    // Custom tem prioridade — sem fetch
    if (customUrl) {
      setUrl(customUrl);
      return;
    }

    if (!title) {
      setUrl(null);
      return;
    }

    // Busca async
    fetchTripCoverUrl(title, null).then((result) => {
      if (!cancelled) setUrl(result);
    });

    return () => {
      cancelled = true;
    };
  }, [title, customUrl]);

  return url;
}

/**
 * Hook pra carregar lista de sugestões (usado no wizard de capa).
 *
 * @returns { suggestions, loading }
 */
export function useCoverSuggestions(title: string | null | undefined): {
  suggestions: string[];
  loading: boolean;
} {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!title?.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchCoverSuggestions(title).then((result) => {
      if (!cancelled) {
        setSuggestions(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [title]);

  return { suggestions, loading };
}
