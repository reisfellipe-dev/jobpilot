import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jobpilot.theme';

interface ThemeContextValue {
  theme: Theme;
  /** true quando o tema esta seguindo o sistema, sem escolha manual salva. */
  followsSystem: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Volta a seguir a preferencia do sistema operacional. */
  useSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Aplica o tema no <html>. O estado inicial ja foi definido por
 * public/theme-init.js antes da primeira pintura; aqui apenas mantemos o
 * React em sincronia com o que esta no DOM.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#08090c');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains('light') ? 'light' : 'dark',
  );
  const [followsSystem, setFollowsSystem] = useState(() => readStored() === null);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setFollowsSystem(false);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Sem persistencia (aba anonima, storage bloqueado): vale so nesta sessao. */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
  }, [setTheme]);

  const useSystemTheme = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* idem */
    }
    setFollowsSystem(true);
    const next = systemTheme();
    setThemeState(next);
    applyTheme(next);
  }, []);

  // Enquanto nao houver escolha manual, acompanha o sistema em tempo real.
  useEffect(() => {
    if (!followsSystem) return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next = systemTheme();
      setThemeState(next);
      applyTheme(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [followsSystem]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, followsSystem, setTheme, toggleTheme, useSystemTheme }),
    [theme, followsSystem, setTheme, toggleTheme, useSystemTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme precisa estar dentro de <ThemeProvider>.');
  return context;
}
