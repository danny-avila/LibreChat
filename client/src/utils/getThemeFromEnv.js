/**
 * Theme tokens configurable at deploy time. Each entry is the `IThemeRGB` key
 * without its `rgb-` prefix, and maps to `REACT_APP_THEME_<UPPER_SNAKE>`.
 * Keep this list in sync with `IThemeRGB` so every applied CSS variable stays
 * reachable from the environment.
 */
const THEME_TOKENS = [
  'text-primary',
  'text-secondary',
  'text-secondary-alt',
  'text-tertiary',
  'text-warning',
  'text-destructive',

  'link',
  'link-hover',
  'link-visited',
  'accent-primary',
  'accent-primary-hover',

  'ring-primary',

  'header-primary',
  'header-hover',
  'header-button-hover',

  'surface-active',
  'surface-active-alt',
  'surface-hover',
  'surface-hover-alt',
  'surface-primary',
  'surface-primary-alt',
  'surface-primary-contrast',
  'surface-secondary',
  'surface-secondary-alt',
  'surface-tertiary',
  'surface-tertiary-alt',
  'surface-dialog',
  'surface-submit',
  'surface-submit-hover',
  'surface-destructive',
  'surface-destructive-hover',
  'surface-chat',
  'surface-inverted',
  'surface-inverted-hover',
  'text-inverted',
  'surface-fixed',
  'surface-fixed-hover',
  'text-fixed',

  'border-light',
  'border-medium',
  'border-medium-alt',
  'border-heavy',
  'border-xheavy',
  'border-destructive',

  'status-success',
  'status-success-subtle',
  'status-success-border',
  'status-info',
  'status-info-subtle',
  'status-info-border',
  'status-warning',
  'status-warning-subtle',
  'status-warning-border',
  'status-error',
  'status-error-subtle',
  'status-error-border',
  'status-neutral',
  'status-neutral-subtle',
  'status-neutral-border',

  'brand-purple',

  'presentation',
];

const toEnvName = (token) => `REACT_APP_THEME_${token.toUpperCase().replace(/-/g, '_')}`;

/**
 * Loads theme configuration from build-time environment variables. Values are
 * inlined by Vite, so `REACT_APP_THEME_*` must be present when the client is
 * built; changing them afterwards has no effect until the next build.
 * @param {Record<string, string | undefined>} [env] Environment source, defaults to the build-time env
 * @returns {import('@librechat/client').IThemeRGB | undefined}
 */
export function getThemeFromEnv(env = import.meta.env) {
  const theme = THEME_TOKENS.reduce((acc, token) => {
    const value = env[toEnvName(token)];
    if (value) {
      acc[`rgb-${token}`] = value;
    }
    return acc;
  }, {});

  return Object.keys(theme).length > 0 ? theme : undefined;
}
