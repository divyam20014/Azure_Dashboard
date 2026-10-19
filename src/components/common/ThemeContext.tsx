import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ThemeValue {
  dark: boolean;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeValue>({ dark: false, toggle: () => {} });

/** Light theme by default. The choice is kept in memory only (no browser storage is used by this app). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const toggle = useCallback(() => setDark((d) => !d), []);
  const value = useMemo(() => ({ dark, toggle }), [dark, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeCtx);
}
