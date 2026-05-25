/**
 * ThemeProvider v3 — sem remontagem de árvore.
 *
 * Problema das versões anteriores:
 * - v1: React.Fragment key= remontava TUDO, re-executando todos os useEffect
 *   de fetch/supabase → loop de "Network request failed" no Expo Go.
 * - v2: mesmo problema — reloadKey++ remonta a árvore inteira.
 *
 * Solução v3:
 * - Nunca remonta a árvore.
 * - `colors` (objeto mutável em theme.ts) é atualizado via Object.assign.
 * - `themeVersion` no context incrementa para forçar re-render dos useStyles().
 * - useStyles() usa useMemo([themeVersion]) em vez de useMemo([themeVersion]).
 * - Transição: overlay de fade cobre a tela enquanto as cores atualizam.
 *   Como não há remontagem, os componentes simplesmente re-renderizam
 *   com as novas cores após o themeVersion mudar.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Appearance,
  type ColorSchemeName,
  StyleSheet,
} from 'react-native';

import {
  applyTheme,
  getPalette,
  type ColorPalette,
  type ThemeMode,
} from '@/lib/theme';

export type ThemePref = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  pref: ThemePref;
  effective: ThemeMode;
  palette: ColorPalette;
  /** Versão do tema — incrementa a cada troca. useStyles() usa como dep. */
  themeVersion: number;
  setPref: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  pref: 'system',
  effective: 'dark',
  palette: getPalette('dark'),
  themeVersion: 0,
  setPref: () => {},
});

const STORAGE_KEY = 'trajet:theme-pref';
const TRANSITION_MS = 250;

function resolveEffective(pref: ThemePref, sys: ColorSchemeName): ThemeMode {
  if (pref === 'system') return sys === 'light' ? 'light' : 'dark';
  return pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );
  const [bootstrapped, setBootstrapped] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const [currentPalette, setCurrentPalette] = useState<ColorPalette>(
    getPalette('dark'),
  );
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const pendingMode = useRef<ThemeMode | null>(null);
  const initialApplied = useRef(false);

  // Bootstrap: carrega preferência salva
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val === 'light' || val === 'dark' || val === 'system') {
          setPrefState(val);
        }
      })
      .catch(() => {})
      .finally(() => setBootstrapped(true));
  }, []);

  // Listener do sistema
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const effective = resolveEffective(pref, systemScheme);

  // Aplica tema — SEM remontagem
  useEffect(() => {
    if (!bootstrapped) return;

    if (!initialApplied.current) {
      // Primeira aplicação: instante, sem animação
      initialApplied.current = true;
      applyTheme(effective);
      setCurrentPalette(getPalette(effective));
      setThemeVersion(v => v + 1);
      return;
    }

    if (isTransitioning.current) {
      pendingMode.current = effective;
      return;
    }

    doTransition(effective);
  }, [effective, bootstrapped]); // eslint-disable-line react-hooks/exhaustive-deps

  function doTransition(mode: ThemeMode) {
    isTransitioning.current = true;

    const overlayColor = mode === 'light'
      ? 'rgba(245,247,250,1)'
      : 'rgba(10,14,26,1)';

    // Fase 1: fade-in overlay
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: TRANSITION_MS / 2,
      useNativeDriver: true,
    }).start(() => {
      // Aplica tema enquanto coberto — NÃO remonta
      applyTheme(mode);
      setCurrentPalette(getPalette(mode));
      setThemeVersion(v => v + 1);

      // Fase 2: fade-out
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: TRANSITION_MS / 2,
        useNativeDriver: true,
      }).start(() => {
        isTransitioning.current = false;
        if (pendingMode.current !== null) {
          const next = pendingMode.current;
          pendingMode.current = null;
          doTransition(next);
        }
      });
    });
  }

  const setPref = useCallback((newPref: ThemePref) => {
    setPrefState(newPref);
    AsyncStorage.setItem(STORAGE_KEY, newPref).catch(() => {});
  }, []);

  // Mantém a cor do overlay atualizada quando troca de tema
  const overlayBg = effective === 'light'
    ? 'rgba(245,247,250,1)'
    : 'rgba(10,14,26,1)';

  return (
    <ThemeContext.Provider
      value={{ pref, effective, palette: currentPalette, themeVersion, setPref }}
    >
      {/* SEM React.Fragment key= — não remonta */}
      {children}

      {/* Overlay de transição */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: overlayBg, opacity: overlayOpacity },
        ]}
      />
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
