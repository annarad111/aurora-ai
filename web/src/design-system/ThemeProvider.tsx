import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** The two colour themes the user can pick in the theme switch. */
export type ThemePreference = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark'];

const THEME_STORAGE_KEY = 'aurora.theme-preference';
const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The stored choice, or the operating system's setting on a first visit.
 * An older stored "system" choice is read the same way, once.
 * localStorage can throw (private mode, blocked storage), so failures fall back to the system setting.
 */
function readInitialThemePreference(): ThemePreference {
  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedValue === 'light' || storedValue === 'dark') return storedValue;
  } catch {
    // Fall through to the system setting.
  }
  return window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches ? 'dark' : 'light';
}

function storeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not being able to remember the theme is harmless.
  }
}

/**
 * Owns the theme for the whole app. It writes `data-theme="light" | "dark"` on <html>,
 * and the Sass themes (styles/themes/_theme-variables.scss) switch colours based on that attribute.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(readInitialThemePreference);

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
    storeThemePreference(themePreference);
  }, [themePreference]);

  return <ThemeContext.Provider value={{ themePreference, setThemePreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return themeContext;
}
