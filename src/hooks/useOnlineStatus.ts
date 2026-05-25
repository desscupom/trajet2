import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Hook que detecta se o app está online ou offline.
 *
 * Estratégia (sem depender de @react-native-community/netinfo):
 * - **Web**: usa `navigator.onLine` + listeners 'online'/'offline'.
 * - **Native**: assume online por default. Marca como offline APENAS quando:
 *   - O usuário tenta uma mutation e ela falha com erro de rede
 *   - Após X falhas consecutivas (evita false positives de latência)
 *
 * Decisão: NÃO fazer polling em loop porque:
 * - Polling gera tráfego sem necessidade
 * - Em rede ruim/lenta, polling falha mais que o uso real
 * - O usuário não precisa saber "tá offline" antes de tentar fazer algo
 */

let cachedStatus = true; // assume online por default
const listeners = new Set<(online: boolean) => void>();

// Contador de falhas consecutivas — só marca offline após N falhas seguidas
let consecutiveFailures = 0;
const FAILURES_TO_OFFLINE = 2;

function notify(online: boolean) {
  if (cachedStatus === online) return;
  cachedStatus = online;
  listeners.forEach((cb) => cb(online));
}

async function pingSupabase(): Promise<boolean> {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!url) return true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Registra uma falha de rede (chamado pelo wrapper supabaseQueued).
 */
export function reportNetworkFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURES_TO_OFFLINE) {
    notify(false);
  }
}

/**
 * Registra um sucesso de rede (resetar contador, marcar online).
 */
export function reportNetworkSuccess(): void {
  consecutiveFailures = 0;
  notify(true);
}

/**
 * Força uma checagem imediata. Sem loop.
 */
export async function pingNow(): Promise<boolean> {
  const online = await pingSupabase();
  if (online) {
    reportNetworkSuccess();
  } else {
    reportNetworkFailure();
  }
  return online;
}

let webListenersAttached = false;

function ensureWatcher() {
  if (Platform.OS === 'web') {
    if (webListenersAttached) return;
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      consecutiveFailures = 0;
      notify(true);
    };
    const onOffline = () => notify(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    cachedStatus = window.navigator?.onLine ?? true;
    webListenersAttached = true;
  }
  // Native: sem polling.
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(cachedStatus);
  useEffect(() => {
    ensureWatcher();
    listeners.add(setOnline);
    return () => {
      listeners.delete(setOnline);
    };
  }, []);
  return online;
}

export function getOnlineStatus(): boolean {
  return cachedStatus;
}
