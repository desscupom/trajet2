import { useEffect, useRef, useState } from 'react';

import {
  drain,
  getCountSync,
  getStatus,
  subscribe,
} from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Hook coordenador da queue offline.
 *
 * Responsabilidades:
 * - Monitora a contagem da fila (atualiza ao adicionar/remover)
 * - Quando o app volta a ficar online, dispara `drain()` automaticamente
 * - Expõe contagem pra UI (banner)
 *
 * IMPORTANTE: instanciar APENAS UMA VEZ no app (no `_layout.tsx`).
 * Múltiplas instâncias multiplicariam os drains.
 */
export function useOfflineQueueCoordinator(): {
  pendingCount: number;
  online: boolean;
  draining: boolean;
} {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(getCountSync());
  const [draining, setDraining] = useState(false);
  // Ref pra evitar race: re-render entre setDraining(true) e o effect terminar
  // poderia disparar 2 drains paralelos.
  const drainingRef = useRef(false);

  // Sub na queue
  useEffect(() => {
    const refresh = () => {
      getStatus().then((s) => setPendingCount(s.pending));
    };
    refresh(); // load inicial
    return subscribe(refresh);
  }, []);

  // Quando vira online com fila pendente → drena
  useEffect(() => {
    if (!online || pendingCount === 0 || drainingRef.current) return;

    let cancelled = false;
    drainingRef.current = true;
    setDraining(true);
    drain()
      .then((drained) => {
        if (!cancelled && drained > 0) {
        }
      })
      .finally(() => {
        drainingRef.current = false;
        if (!cancelled) setDraining(false);
      });

    return () => {
      cancelled = true;
    };
  }, [online, pendingCount]);

  return { pendingCount, online, draining };
}
