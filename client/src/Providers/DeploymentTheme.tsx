import { useEffect, useMemo, useReducer, useRef } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { notifyManager, useQueryClient } from '@tanstack/react-query';
import {
  ThemeProvider,
  clickHouseTheme,
  libreChatTheme,
  fromLegacyTheme,
  validateThemeDefinition,
} from '@librechat/client';
import type { IThemeRGB, ThemeDefinition } from '@librechat/client';
import type { TInterfaceConfig } from 'librechat-data-provider';
import type { ComponentProps } from 'react';
import { getThemeFromEnv } from '~/utils/getThemeFromEnv';
import { useGetStartupConfig } from '~/data-provider';

type DeploymentThemeValue = TInterfaceConfig['theme'];

const bundledThemes: Readonly<Record<string, ThemeDefinition>> = {
  librechat: libreChatTheme,
  clickhouse: clickHouseTheme,
};

/**
 * Resolves `interface.theme` from librechat.yaml to a theme definition: a bundled
 * name, or an inline definition that passes the registry's validation. Anything
 * else is reported once and ignored, so a bad value falls back to today's theme.
 */
export function resolveDeploymentTheme(theme: DeploymentThemeValue): ThemeDefinition | undefined {
  if (theme == null) {
    return undefined;
  }

  if (typeof theme === 'string') {
    const definition = Object.hasOwn(bundledThemes, theme) ? bundledThemes[theme] : undefined;
    if (!definition) {
      console.warn(`[DeploymentTheme] Ignoring unknown interface.theme "${theme}"`);
    }
    return definition;
  }

  const definition = theme as ThemeDefinition;
  const errors = validateThemeDefinition(definition);
  if (errors.length > 0) {
    console.warn(`[DeploymentTheme] Ignoring invalid interface.theme: ${errors.join('; ')}`);
    return undefined;
  }
  return definition;
}

/** A corrupt entry reads as absent, so the next storage adapter still gets its turn. */
const parseStored = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const isValidDefinition = (value: unknown): value is ThemeDefinition =>
  typeof value === 'object' &&
  value !== null &&
  validateThemeDefinition(value as ThemeDefinition).length === 0;

/**
 * The user's own theme in the shape `ThemeProvider` restores it: a versioned
 * definition, or legacy colors that the provider overlays on both modes. Stored
 * with source `legacy`, a definition is the legacy compatibility copy and goes back
 * through the legacy path. The deployment theme is never persisted, so storage
 * still holds this while the deployment theme is applied.
 */
type StoredTheme = { definition: ThemeDefinition } | { legacyColors: IThemeRGB; name: string };

export function readStoredTheme(): StoredTheme | undefined {
  try {
    const definition = parseStored('theme-definition');
    if (isValidDefinition(definition)) {
      const legacyColors = definition.modes.light?.colors;
      return localStorage.getItem('theme-source') === 'legacy' && legacyColors
        ? { legacyColors, name: definition.name }
        : { definition };
    }
    const colors = parseStored('theme-colors');
    if (typeof colors !== 'object' || colors === null) {
      return undefined;
    }
    const name = localStorage.getItem('theme-name') ?? 'custom';
    return isValidDefinition(fromLegacyTheme(colors as IThemeRGB, name))
      ? { legacyColors: colors as IThemeRGB, name }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The auth mutations call `removeQueries()`, which detaches this long-lived
 * observer from the query it was reading; only a re-render rebinds it to the
 * rebuilt one. The cache event is checked by key alone, since it fires for every
 * query in the app, and the re-render is deferred past the render that built it.
 */
function useRebindOnStartupConfigRebuild() {
  const queryClient = useQueryClient();
  const [, rebind] = useReducer((count: number) => count + 1, 0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe(
        notifyManager.batchCalls((event) => {
          if (event.type === 'added' && event.query.queryKey[0] === QueryKeys.startupConfig) {
            rebind();
          }
        }),
      ),
    [queryClient],
  );
}

/**
 * Supplies the deployment theme from the startup config to `ThemeProvider`.
 * Precedence: high-contrast modes (inside the provider), then `interface.theme`,
 * then the `REACT_APP_THEME_*` build colors, then the user's stored theme. The
 * deployment theme is never persisted, so the stored theme survives its removal.
 */
export default function DeploymentTheme({ children }: { children: React.ReactNode }) {
  const envTheme = useMemo(() => getThemeFromEnv(), []);
  useRebindOnStartupConfigRebuild();
  const { data: startupConfig } = useGetStartupConfig({ keepPreviousData: true });
  const configTheme = startupConfig?.interface?.theme;
  const themeDefinition = useMemo(() => resolveDeploymentTheme(configTheme), [configTheme]);

  /** Once a deployment theme has been applied, clearing it must not write storage either. */
  const deploymentThemeApplied = useRef(false);
  if (themeDefinition) {
    deploymentThemeApplied.current = true;
  }

  /**
   * Clearing the prop would leave the provider on the LibreChat palette, so a
   * deployment theme that goes away hands the provider the user's stored theme,
   * unless the build-time colors outrank it.
   */
  const storedTheme = useMemo(
    () =>
      !themeDefinition && deploymentThemeApplied.current && !envTheme
        ? readStoredTheme()
        : undefined,
    [themeDefinition, envTheme],
  );

  const props: Omit<ComponentProps<typeof ThemeProvider>, 'children'> = {
    ...(envTheme && { initialTheme: 'system', themeRGB: envTheme }),
    ...(themeDefinition && { themeDefinition }),
    ...(storedTheme && 'definition' in storedTheme && { themeDefinition: storedTheme.definition }),
    ...(storedTheme &&
      'legacyColors' in storedTheme && {
        themeRGB: storedTheme.legacyColors,
        themeName: storedTheme.name,
      }),
    ...(deploymentThemeApplied.current && { persistThemeDefinition: false }),
  };

  return <ThemeProvider {...props}>{children}</ThemeProvider>;
}
