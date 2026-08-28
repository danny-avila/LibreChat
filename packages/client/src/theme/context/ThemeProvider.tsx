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
import applyTheme, { applyResolvedTheme, themeOwnedProperties } from '../utils/applyTheme';
import { fromLegacyTheme, resolveTheme, validateThemeDefinition } from '../registry';

const THEME_KEY = 'color-theme';
const THEME_COLORS_KEY = 'theme-colors';
const THEME_NAME_KEY = 'theme-name';
const THEME_DEFINITION_KEY = 'theme-definition';
const THEME_SOURCE_KEY = 'theme-source';
const themeModes = ['light', 'dark', 'system'] as const;

type AppearanceMode = (typeof themeModes)[number];

type InitialThemeState = {
  definition?: ThemeDefinition;
  legacyColors?: IThemeRGB;
};

type ThemeDOMSnapshot = {
  properties: Map<string, { value: string; priority: string }>;
  dataTheme: string | null;
};

type ThemeClassSnapshot = {
  dark: boolean;
  light: boolean;
};

type ThemePropSnapshot = Pick<
  ThemeProviderProps,
  'initialTheme' | 'themeDefinition' | 'themeName' | 'themeRGB'
>;

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
  /** Whether theme definition, color, name, and source changes should be persisted. */
  persistThemeDefinition?: boolean;
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
  try {
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
  } catch {
    return false;
  }
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
  const storedSource = readStorage(THEME_SOURCE_KEY);
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
        return {
          definition: parsed,
          legacyColors: storedSource === 'legacy' ? parsed.modes.light?.colors : undefined,
        };
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

const captureThemeDOM = (root: HTMLElement): ThemeDOMSnapshot => ({
  properties: new Map(
    themeOwnedProperties.map((property) => [
      property,
      {
        value: root.style.getPropertyValue(property),
        priority: root.style.getPropertyPriority(property),
      },
    ]),
  ),
  dataTheme: root.getAttribute('data-theme'),
});

const restoreThemeDOM = (snapshot: ThemeDOMSnapshot, root: HTMLElement): void => {
  snapshot.properties.forEach(({ value, priority }, property) => {
    if (!value) {
      root.style.removeProperty(property);
      return;
    }
    root.style.setProperty(property, value, priority);
  });

  if (snapshot.dataTheme === null) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', snapshot.dataTheme);
  }
};

export function ThemeProvider({
  children,
  themeRGB: propThemeRGB,
  themeDefinition: propThemeDefinition,
  persistThemeDefinition = true,
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
      const storedThemeState = getStoredThemeState();
      initialThemeState.current =
        propThemeName !== undefined && storedThemeState.definition
          ? {
              ...storedThemeState,
              definition: {
                ...storedThemeState.definition,
                name: propThemeName.trim() || 'custom',
              },
            }
          : storedThemeState;
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
  const legacyThemeRGBRef = useRef(legacyThemeRGB);
  legacyThemeRGBRef.current = legacyThemeRGB;
  const themeDefinitionRef = useRef(themeDefinition);
  themeDefinitionRef.current = themeDefinition;
  const [themeName, setThemeNameState] = useState<string | undefined>(
    themeDefinition?.name ?? propThemeName ?? getInitialThemeName,
  );
  const themeNameRef = useRef(themeName);
  themeNameRef.current = themeName;
  const persistedInitialProps = useRef(false);
  const previousThemeProps = useRef<ThemePropSnapshot>({
    initialTheme,
    themeDefinition: propThemeDefinition,
    themeName: propThemeName,
    themeRGB: propThemeRGB,
  });
  const controlledThemeActive = useRef(
    Boolean(
      (propThemeDefinition && isValidThemeDefinition(propThemeDefinition)) ||
        (!propThemeDefinition && propThemeRGB),
    ),
  );
  const synchronizedThemeProps = useRef(false);
  const themeDOMSnapshot = useRef<ThemeDOMSnapshot | undefined>(undefined);
  const themeClassSnapshot = useRef<ThemeClassSnapshot | undefined>(undefined);

  const writeThemeStorage = useCallback(
    (key: string, value?: string) => {
      if (!persistThemeDefinition) {
        return;
      }
      writeStorage(key, value);
    },
    [persistThemeDefinition],
  );

  const restoreAppliedTheme = useCallback((root = window.document.documentElement) => {
    if (!themeDOMSnapshot.current) {
      return;
    }
    restoreThemeDOM(themeDOMSnapshot.current, root);
    themeDOMSnapshot.current = undefined;
  }, []);

  const prepareThemeDOM = useCallback((root: HTMLElement) => {
    if (!themeDOMSnapshot.current) {
      themeDOMSnapshot.current = captureThemeDOM(root);
      return;
    }
    restoreThemeDOM(themeDOMSnapshot.current, root);
  }, []);

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
      if (propThemeName !== undefined && themeDefinition) {
        writeThemeStorage(THEME_DEFINITION_KEY, JSON.stringify(themeDefinition));
        writeThemeStorage(THEME_NAME_KEY, themeDefinition.name);
        writeThemeStorage(THEME_SOURCE_KEY, legacyThemeRGB ? 'legacy' : 'definition');
      } else if (propThemeName && !themeDefinition) {
        writeThemeStorage(THEME_NAME_KEY, propThemeName);
      }
      return;
    }

    writeThemeStorage(THEME_DEFINITION_KEY, JSON.stringify(definition));
    writeThemeStorage(THEME_NAME_KEY, definition.name);
    writeThemeStorage(THEME_SOURCE_KEY, legacyDefinition ? 'legacy' : 'definition');
    writeThemeStorage(
      THEME_COLORS_KEY,
      !propThemeDefinition && legacyDefinition
        ? JSON.stringify(legacyDefinition.modes.light?.colors ?? {})
        : undefined,
    );
  }, [
    initialTheme,
    legacyThemeRGB,
    propThemeDefinition,
    propThemeName,
    propThemeRGB,
    themeDefinition,
    writeThemeStorage,
  ]);

  const setTheme = useCallback((newTheme: string) => {
    if (!isAppearanceMode(newTheme)) {
      return;
    }
    setThemeState(newTheme);
    writeStorage(THEME_KEY, newTheme);
  }, []);

  const setThemeDefinition = useCallback(
    (definition?: ThemeDefinition) => {
      const errors = definition ? validateThemeDefinition(definition) : [];
      if (errors.length > 0) {
        throw new TypeError(errors.join('\n'));
      }
      themeDefinitionRef.current = definition;
      setThemeDefinitionState(definition);
      legacyThemeRGBRef.current = undefined;
      setLegacyThemeRGB(undefined);
      writeThemeStorage(THEME_DEFINITION_KEY, definition ? JSON.stringify(definition) : undefined);
      writeThemeStorage(THEME_COLORS_KEY);
      writeThemeStorage(THEME_SOURCE_KEY, definition ? 'definition' : undefined);
      setThemeNameState(definition?.name);
      themeNameRef.current = definition?.name;
      writeThemeStorage(THEME_NAME_KEY, definition?.name);
    },
    [writeThemeStorage],
  );

  const setThemeRGB = useCallback(
    (colors?: IThemeRGB) => {
      const definition = colors
        ? fromLegacyTheme(colors, themeDefinitionRef.current?.name ?? themeNameRef.current)
        : undefined;
      const legacyColors = definition?.modes.light?.colors;
      themeDefinitionRef.current = definition;
      setThemeDefinitionState(definition);
      legacyThemeRGBRef.current = legacyColors;
      setLegacyThemeRGB(legacyColors);
      setThemeNameState(definition?.name);
      themeNameRef.current = definition?.name;
      writeThemeStorage(THEME_DEFINITION_KEY, definition ? JSON.stringify(definition) : undefined);
      writeThemeStorage(THEME_NAME_KEY, definition?.name);
      writeThemeStorage(THEME_COLORS_KEY, legacyColors ? JSON.stringify(legacyColors) : undefined);
      writeThemeStorage(THEME_SOURCE_KEY, definition ? 'legacy' : undefined);
    },
    [writeThemeStorage],
  );

  const setThemeName = useCallback(
    (name?: string) => {
      const currentDefinition = themeDefinitionRef.current;
      const nextName = name?.trim() || (currentDefinition ? 'custom' : undefined);
      setThemeNameState(nextName);
      themeNameRef.current = nextName;
      writeThemeStorage(THEME_NAME_KEY, nextName);

      if (!nextName || !currentDefinition) {
        return;
      }

      const renamedDefinition = { ...currentDefinition, name: nextName };
      themeDefinitionRef.current = renamedDefinition;
      setThemeDefinitionState(renamedDefinition);
      writeThemeStorage(THEME_DEFINITION_KEY, JSON.stringify(renamedDefinition));
      writeThemeStorage(THEME_SOURCE_KEY, legacyThemeRGBRef.current ? 'legacy' : 'definition');
    },
    [writeThemeStorage],
  );

  useEffect(() => {
    if (!synchronizedThemeProps.current) {
      synchronizedThemeProps.current = true;
      return;
    }

    const previous = previousThemeProps.current;
    const definitionChanged = propThemeDefinition !== previous.themeDefinition;
    const legacyColorsChanged = propThemeRGB !== previous.themeRGB;
    const switchedToLegacyColors =
      definitionChanged && !propThemeDefinition && propThemeRGB !== undefined;
    let clearedControlledDefinition = false;

    if (definitionChanged || legacyColorsChanged) {
      if (propThemeDefinition) {
        if (isValidThemeDefinition(propThemeDefinition)) {
          setThemeDefinition(propThemeDefinition);
          controlledThemeActive.current = true;
        }
      } else if (propThemeRGB) {
        setThemeRGB(propThemeRGB);
        controlledThemeActive.current = true;
      } else if (controlledThemeActive.current) {
        setThemeDefinition(undefined);
        controlledThemeActive.current = false;
        clearedControlledDefinition = true;
      }
    }

    if (
      !propThemeDefinition &&
      (propThemeName !== previous.themeName ||
        switchedToLegacyColors ||
        clearedControlledDefinition)
    ) {
      setThemeName(propThemeName);
    }
    if (initialTheme !== previous.initialTheme && initialTheme && isAppearanceMode(initialTheme)) {
      setTheme(initialTheme);
    }

    previousThemeProps.current = {
      initialTheme,
      themeDefinition: propThemeDefinition,
      themeName: propThemeName,
      themeRGB: propThemeRGB,
    };
  }, [
    initialTheme,
    propThemeDefinition,
    propThemeName,
    propThemeRGB,
    setTheme,
    setThemeDefinition,
    setThemeName,
    setThemeRGB,
  ]);

  const applyThemeMode = useCallback(
    (currentTheme: AppearanceMode) => {
      const root = window.document.documentElement;
      const mode: ThemeMode = isDark(currentTheme) ? 'dark' : 'light';

      if (!themeClassSnapshot.current) {
        themeClassSnapshot.current = {
          dark: root.classList.contains('dark'),
          light: root.classList.contains('light'),
        };
      }

      root.classList.toggle('dark', mode === 'dark');
      root.classList.toggle('light', mode === 'light');

      if (!themeDefinition) {
        restoreAppliedTheme(root);
        return;
      }

      prepareThemeDOM(root);

      if (legacyThemeRGB) {
        applyTheme(legacyThemeRGB, root);
        root.dataset.theme = themeDefinition.name;
        return;
      }

      try {
        applyResolvedTheme(resolveTheme(themeDefinition, mode), root);
      } catch (error) {
        restoreAppliedTheme(root);
        console.error('Unable to apply theme definition', error);
      }
    },
    [legacyThemeRGB, prepareThemeDOM, restoreAppliedTheme, themeDefinition],
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

  useEffect(
    () => () => {
      const root = window.document.documentElement;
      restoreAppliedTheme(root);
      if (themeClassSnapshot.current) {
        root.classList.toggle('dark', themeClassSnapshot.current.dark);
        root.classList.toggle('light', themeClassSnapshot.current.light);
        themeClassSnapshot.current = undefined;
      }
    },
    [restoreAppliedTheme],
  );

  const resetTheme = useCallback(() => {
    setTheme('system');
    setThemeDefinition(undefined);
    writeThemeStorage(THEME_COLORS_KEY);
    restoreAppliedTheme();
  }, [restoreAppliedTheme, setTheme, setThemeDefinition, writeThemeStorage]);

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
