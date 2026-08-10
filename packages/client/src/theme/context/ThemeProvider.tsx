import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { JSX } from 'react/jsx-runtime';
import type { IThemeRGB, ThemeDefinition, ThemeMode } from '../types';
import applyTheme, { applyResolvedTheme, clearAppliedTheme } from '../utils/applyTheme';
import { fromLegacyTheme, resolveTheme, validateThemeDefinition } from '../registry';

const THEME_KEY = 'color-theme';
const THEME_COLORS_KEY = 'theme-colors';
const THEME_NAME_KEY = 'theme-name';
const THEME_DEFINITION_KEY = 'theme-definition';
const themeModes = ['light', 'dark', 'system'] as const;

type AppearanceMode = (typeof themeModes)[number];

type InitialThemeState = {
  definition?: ThemeDefinition;
  legacyColors?: IThemeRGB;
};

type ThemeContextType = {
  theme: AppearanceMode;
  setTheme: (theme: string) => void;
  themeRGB?: IThemeRGB;
  setThemeRGB: (colors?: IThemeRGB) => void;
  themeDefinition?: ThemeDefinition;
  setThemeDefinition: (definition?: ThemeDefinition) => void;
  themeName?: string;
  setThemeName: (name?: string) => void;
  resetTheme: () => void;
};

export const ThemeContext: React.Context<ThemeContextType> = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => undefined,
  setThemeRGB: () => undefined,
  setThemeDefinition: () => undefined,
  setThemeName: () => undefined,
  resetTheme: () => undefined,
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  themeRGB?: IThemeRGB;
  themeDefinition?: ThemeDefinition;
  themeName?: string;
  initialTheme?: string;
}

export const isDark = (theme: string): boolean => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return theme === 'dark';
};

const isAppearanceMode = (value: string): value is AppearanceMode =>
  themeModes.includes(value as AppearanceMode);

const isValidThemeColors = (value: unknown): value is IThemeRGB => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    return validateThemeDefinition(fromLegacyTheme(value as IThemeRGB)).length === 0;
  } catch {
    return false;
  }
};

const isValidThemeDefinition = (value: unknown): value is ThemeDefinition => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const definition = value as ThemeDefinition;
  if (
    definition.version !== 1 ||
    typeof definition.name !== 'string' ||
    typeof definition.modes !== 'object' ||
    definition.modes === null
  ) {
    return false;
  }

  return validateThemeDefinition(definition).length === 0;
};

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value?: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value === undefined) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    // Storage is an optional persistence adapter.
  }
};

const getInitialTheme = (): AppearanceMode => {
  const stored = readStorage(THEME_KEY);
  return stored && isAppearanceMode(stored) ? stored : 'system';
};

const getStoredThemeState = (): InitialThemeState => {
  let legacyColors: IThemeRGB | undefined;
  const storedColors = readStorage(THEME_COLORS_KEY);
  if (storedColors) {
    try {
      const parsed: unknown = JSON.parse(storedColors);
      if (isValidThemeColors(parsed)) {
        legacyColors = fromLegacyTheme(parsed).modes.light?.colors;
      }
    } catch {
      // Invalid legacy data is ignored.
    }
  }

  const storedDefinition = readStorage(THEME_DEFINITION_KEY);
  if (storedDefinition) {
    try {
      const parsed: unknown = JSON.parse(storedDefinition);
      if (isValidThemeDefinition(parsed)) {
        return { definition: parsed, legacyColors };
      }
    } catch {
      // Fall through to the legacy storage adapter.
    }
  }

  if (!legacyColors) {
    return {};
  }

  return {
    definition: fromLegacyTheme(legacyColors, readStorage(THEME_NAME_KEY) ?? 'custom'),
    legacyColors,
  };
};

const getInitialThemeName = (): string | undefined => readStorage(THEME_NAME_KEY) ?? undefined;

export function ThemeProvider({
  children,
  themeRGB: propThemeRGB,
  themeDefinition: propThemeDefinition,
  themeName: propThemeName,
  initialTheme,
}: ThemeProviderProps): JSX.Element {
  const initialThemeState = useRef<InitialThemeState | undefined>(undefined);
  if (!initialThemeState.current) {
    if (propThemeDefinition && isValidThemeDefinition(propThemeDefinition)) {
      initialThemeState.current = { definition: propThemeDefinition };
    } else if (!propThemeDefinition && propThemeRGB) {
      const definition = fromLegacyTheme(propThemeRGB, propThemeName);
      initialThemeState.current = {
        definition,
        legacyColors: definition.modes.light?.colors,
      };
    } else {
      initialThemeState.current = getStoredThemeState();
    }
  }

  const [theme, setThemeState] = useState<AppearanceMode>(() =>
    initialTheme && isAppearanceMode(initialTheme) ? initialTheme : getInitialTheme(),
  );
  const [themeDefinition, setThemeDefinitionState] = useState<ThemeDefinition | undefined>(
    initialThemeState.current.definition,
  );
  const [legacyThemeRGB, setLegacyThemeRGB] = useState<IThemeRGB | undefined>(
    initialThemeState.current.legacyColors,
  );
  const themeDefinitionRef = useRef(themeDefinition);
  themeDefinitionRef.current = themeDefinition;
  const [themeName, setThemeNameState] = useState<string | undefined>(
    themeDefinition?.name ?? propThemeName ?? getInitialThemeName,
  );
  const themeNameRef = useRef(themeName);
  themeNameRef.current = themeName;
  const persistedInitialProps = useRef(false);

  useEffect(() => {
    if (persistedInitialProps.current) {
      return;
    }
    persistedInitialProps.current = true;

    if (initialTheme && isAppearanceMode(initialTheme)) {
      writeStorage(THEME_KEY, initialTheme);
    }

    const validPropDefinition =
      propThemeDefinition && isValidThemeDefinition(propThemeDefinition)
        ? propThemeDefinition
        : undefined;
    if (propThemeDefinition && !validPropDefinition) {
      return;
    }

    const legacyDefinition =
      !propThemeDefinition && propThemeRGB
        ? fromLegacyTheme(propThemeRGB, propThemeName)
        : undefined;
    const definition = validPropDefinition ?? legacyDefinition;
    if (!definition) {
      if (propThemeName && !themeDefinition) {
        writeStorage(THEME_NAME_KEY, propThemeName);
      }
      return;
    }

    writeStorage(THEME_DEFINITION_KEY, JSON.stringify(definition));
    writeStorage(THEME_NAME_KEY, definition.name);
    writeStorage(
      THEME_COLORS_KEY,
      !propThemeDefinition && legacyDefinition
        ? JSON.stringify(legacyDefinition.modes.light?.colors ?? {})
        : undefined,
    );
  }, [initialTheme, propThemeDefinition, propThemeName, propThemeRGB, themeDefinition]);

  const setTheme = useCallback((newTheme: string) => {
    if (!isAppearanceMode(newTheme)) {
      return;
    }
    setThemeState(newTheme);
    writeStorage(THEME_KEY, newTheme);
  }, []);

  const setThemeDefinition = useCallback((definition?: ThemeDefinition) => {
    const errors = definition ? validateThemeDefinition(definition) : [];
    if (errors.length > 0) {
      throw new TypeError(errors.join('\n'));
    }
    themeDefinitionRef.current = definition;
    setThemeDefinitionState(definition);
    setLegacyThemeRGB(undefined);
    writeStorage(THEME_DEFINITION_KEY, definition ? JSON.stringify(definition) : undefined);
    writeStorage(THEME_COLORS_KEY);
    setThemeNameState(definition?.name);
    themeNameRef.current = definition?.name;
    writeStorage(THEME_NAME_KEY, definition?.name);
  }, []);

  const setThemeRGB = useCallback((colors?: IThemeRGB) => {
    const definition = colors
      ? fromLegacyTheme(colors, themeDefinitionRef.current?.name ?? themeNameRef.current)
      : undefined;
    const legacyColors = definition?.modes.light?.colors;
    themeDefinitionRef.current = definition;
    setThemeDefinitionState(definition);
    setLegacyThemeRGB(legacyColors);
    setThemeNameState(definition?.name);
    themeNameRef.current = definition?.name;
    writeStorage(THEME_DEFINITION_KEY, definition ? JSON.stringify(definition) : undefined);
    writeStorage(THEME_NAME_KEY, definition?.name);
    writeStorage(THEME_COLORS_KEY, legacyColors ? JSON.stringify(legacyColors) : undefined);
  }, []);

  const setThemeName = useCallback((name?: string) => {
    const currentDefinition = themeDefinitionRef.current;
    const nextName = name?.trim() || (currentDefinition ? 'custom' : undefined);
    setThemeNameState(nextName);
    themeNameRef.current = nextName;
    writeStorage(THEME_NAME_KEY, nextName);

    if (!nextName || !currentDefinition) {
      return;
    }

    const renamedDefinition = { ...currentDefinition, name: nextName };
    themeDefinitionRef.current = renamedDefinition;
    setThemeDefinitionState(renamedDefinition);
    writeStorage(THEME_DEFINITION_KEY, JSON.stringify(renamedDefinition));
  }, []);

  const applyThemeMode = useCallback(
    (currentTheme: AppearanceMode) => {
      const root = window.document.documentElement;
      const mode: ThemeMode = isDark(currentTheme) ? 'dark' : 'light';

      root.classList.toggle('dark', mode === 'dark');
      root.classList.toggle('light', mode === 'light');

      if (!themeDefinition) {
        clearAppliedTheme(root);
        return;
      }

      if (legacyThemeRGB) {
        applyTheme(legacyThemeRGB, root);
        root.dataset.theme = themeDefinition.name;
        return;
      }

      try {
        applyResolvedTheme(resolveTheme(themeDefinition, mode), root);
      } catch (error) {
        clearAppliedTheme(root);
        console.error('Unable to apply theme definition', error);
      }
    },
    [legacyThemeRGB, themeDefinition],
  );

  useEffect(() => {
    applyThemeMode(theme);
  }, [applyThemeMode, theme]);

  useEffect(() => {
    if (theme !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeMode('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [applyThemeMode, theme]);

  const resetTheme = useCallback(() => {
    setTheme('system');
    setThemeDefinition(undefined);
    writeStorage(THEME_COLORS_KEY);
    clearAppliedTheme();
  }, [setTheme, setThemeDefinition]);

  const themeRGB = legacyThemeRGB ?? themeDefinition?.modes.light?.colors;
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themeRGB,
      setThemeRGB,
      themeDefinition,
      setThemeDefinition,
      themeName,
      setThemeName,
      resetTheme,
    }),
    [
      resetTheme,
      setTheme,
      setThemeDefinition,
      setThemeName,
      setThemeRGB,
      theme,
      themeDefinition,
      themeName,
      themeRGB,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export default ThemeProvider;
