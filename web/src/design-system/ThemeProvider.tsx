import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** What the user picked in the theme switch. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually applied to the page ("system" resolved to light or dark). */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

const THEME_STORAGE_KEY = 'aurora.theme-preference';
const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** localStorage can throw (private mode, blocked storage), so failures fall back to "light". */
function readStoredThemePreference(): ThemePreference {
  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedValue) ? storedValue : 'light';
  } catch {
    return 'light';
  }
}

function storeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not being able to remember the theme is harmless.
  }
}

/** Follows the operating system's dark-mode setting live, including changes while the page is open. */
function useSystemPrefersDark(): boolean {
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return systemPrefersDark;
}

/**
 * Owns the theme for the whole app. It writes `data-theme="light" | "dark"` on <html>,
 * and the Sass themes (styles/themes/_theme-variables.scss) switch colours based on that attribute.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(readStoredThemePreference);
  const systemPrefersDark = useSystemPrefersDark();

  const resolvedTheme: ResolvedTheme =
    themePreference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themePreference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    storeThemePreference(themePreference);
  }, [themePreference]);

  return (
    <ThemeContext.Provider value={{ themePreference, resolvedTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return themeContext;
}
