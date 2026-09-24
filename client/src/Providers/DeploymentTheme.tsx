import { useMemo, useRef } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useIsFetching } from '@tanstack/react-query';
import {
  ThemeProvider,
  clickHouseTheme,
  libreChatTheme,
  validateThemeDefinition,
} from '@librechat/client';
import type { TInterfaceConfig } from 'librechat-data-provider';
import type { ThemeDefinition } from '@librechat/client';
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

/**
 * Supplies the deployment theme from the startup config to `ThemeProvider`.
 * Precedence: high-contrast modes (inside the provider), then `interface.theme`,
 * then the `REACT_APP_THEME_*` build colors, then the user's stored theme. The
 * deployment theme is never persisted, so the stored theme survives its removal.
 */
export default function DeploymentTheme({ children }: { children: React.ReactNode }) {
  const envTheme = useMemo(() => getThemeFromEnv(), []);
  /**
   * The auth mutations call `removeQueries()`, which detaches this long-lived
   * observer from the query it was reading; only a re-render rebinds it to the
   * rebuilt one. Subscribing to the fetch count supplies that re-render.
   */
  useIsFetching([QueryKeys.startupConfig]);
  const { data: startupConfig } = useGetStartupConfig({ keepPreviousData: true });
  const configTheme = startupConfig?.interface?.theme;
  const themeDefinition = useMemo(() => resolveDeploymentTheme(configTheme), [configTheme]);

  /** Once a deployment theme has been applied, clearing it must not write storage either. */
  const deploymentThemeApplied = useRef(false);
  if (themeDefinition) {
    deploymentThemeApplied.current = true;
  }

  const props: Omit<ComponentProps<typeof ThemeProvider>, 'children'> = {
    ...(envTheme && { initialTheme: 'system', themeRGB: envTheme }),
    ...(themeDefinition && { themeDefinition }),
    ...(deploymentThemeApplied.current && { persistThemeDefinition: false }),
  };

  return <ThemeProvider {...props}>{children}</ThemeProvider>;
}
