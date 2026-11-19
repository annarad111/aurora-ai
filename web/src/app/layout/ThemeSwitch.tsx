import { THEME_PREFERENCES, useTheme, type ThemePreference } from '../../design-system/ThemeProvider';

const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
};

export function ThemeSwitch() {
  const { themePreference, setThemePreference } = useTheme();

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {THEME_PREFERENCES.map((preference) => (
        <button
          key={preference}
          type="button"
          className="theme-switch__option"
          aria-pressed={themePreference === preference}
          onClick={() => setThemePreference(preference)}
        >
          {THEME_PREFERENCE_LABELS[preference]}
        </button>
      ))}
    </div>
  );
}
