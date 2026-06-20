/**
 * Single source of truth for the Tailwind semantic color palette.
 *
 * Both Tailwind configs consume this so the `client` SPA and the
 * `@librechat/client` package generate identical color utilities and can
 * never drift apart:
 *   - client/tailwind.config.cjs
 *   - packages/client/tailwind.config.js
 *
 * Semantic tokens resolve to CSS custom properties defined in
 * client/src/style.css (`html`, `.dark`, `.gizmo` blocks). shadcn-compatible
 * tokens hold HSL triplets, so they are wrapped in `hsl(...)`.
 *
 * Opacity modifiers (e.g. `bg-surface-primary/50`) are intentionally not
 * supported yet: the underlying variables hold hex/`rgb()` values rather than
 * bare channels. Migrating the variables to `R G B` triplets and switching to
 * `rgb(var(--x) / <alpha-value>)` is tracked as a follow-up.
 */

const palette = {
  gray: {
    20: '#ececf1',
    50: '#f7f7f8',
    100: '#ececec',
    200: '#e3e3e3',
    300: '#cdcdcd',
    400: '#999696',
    500: '#595959',
    600: '#424242',
    700: '#2f2f2f',
    800: '#212121',
    850: '#171717',
    900: '#0d0d0d',
  },
  green: {
    50: '#f1f9f7',
    100: '#def2ed',
    200: '#a6e5d6',
    300: '#6dc8b9',
    400: '#41a79d',
    500: '#10a37f',
    550: '#349072',
    600: '#126e6b',
    700: '#0a4f53',
    800: '#06373e',
    900: '#031f29',
  },
};

const cssVar = (name) => `var(${name})`;
const hslVar = (name) => `hsl(var(${name}))`;

/**
 * Creates the Tailwind `theme.extend.colors` object backed by CSS variables.
 * This allows dynamic theme switching by changing CSS variable values at
 * runtime (see ThemeProvider / applyTheme).
 */
function createTailwindColors() {
  return {
    ...palette,

    'brand-purple': cssVar('--brand-purple'),
    presentation: cssVar('--presentation'),

    'text-primary': cssVar('--text-primary'),
    'text-secondary': cssVar('--text-secondary'),
    'text-secondary-alt': cssVar('--text-secondary-alt'),
    'text-tertiary': cssVar('--text-tertiary'),
    'text-warning': cssVar('--text-warning'),
    'text-destructive': cssVar('--text-destructive'),

    link: cssVar('--link'),
    'link-hover': cssVar('--link-hover'),
    'link-visited': cssVar('--link-visited'),

    'accent-primary': cssVar('--accent-primary'),
    'accent-primary-hover': cssVar('--accent-primary-hover'),

    'ring-primary': cssVar('--ring-primary'),

    'header-primary': cssVar('--header-primary'),
    'header-hover': cssVar('--header-hover'),
    'header-button-hover': cssVar('--header-button-hover'),

    'surface-active': cssVar('--surface-active'),
    'surface-active-alt': cssVar('--surface-active-alt'),
    'surface-hover': cssVar('--surface-hover'),
    'surface-hover-alt': cssVar('--surface-hover-alt'),
    'surface-primary': cssVar('--surface-primary'),
    'surface-primary-alt': cssVar('--surface-primary-alt'),
    'surface-primary-contrast': cssVar('--surface-primary-contrast'),
    'surface-secondary': cssVar('--surface-secondary'),
    'surface-secondary-alt': cssVar('--surface-secondary-alt'),
    'surface-tertiary': cssVar('--surface-tertiary'),
    'surface-tertiary-alt': cssVar('--surface-tertiary-alt'),
    'surface-dialog': cssVar('--surface-dialog'),
    'surface-submit': cssVar('--surface-submit'),
    'surface-submit-hover': cssVar('--surface-submit-hover'),
    'surface-destructive': cssVar('--surface-destructive'),
    'surface-destructive-hover': cssVar('--surface-destructive-hover'),
    'surface-chat': cssVar('--surface-chat'),

    'border-light': cssVar('--border-light'),
    'border-medium': cssVar('--border-medium'),
    'border-medium-alt': cssVar('--border-medium-alt'),
    'border-heavy': cssVar('--border-heavy'),
    'border-xheavy': cssVar('--border-xheavy'),
    'border-destructive': cssVar('--border-destructive'),

    'status-success': cssVar('--status-success'),
    'status-success-subtle': cssVar('--status-success-subtle'),
    'status-success-border': cssVar('--status-success-border'),
    'status-info': cssVar('--status-info'),
    'status-info-subtle': cssVar('--status-info-subtle'),
    'status-info-border': cssVar('--status-info-border'),
    'status-warning': cssVar('--status-warning'),
    'status-warning-subtle': cssVar('--status-warning-subtle'),
    'status-warning-border': cssVar('--status-warning-border'),
    'status-error': cssVar('--status-error'),
    'status-error-subtle': cssVar('--status-error-subtle'),
    'status-error-border': cssVar('--status-error-border'),
    'status-neutral': cssVar('--status-neutral'),
    'status-neutral-subtle': cssVar('--status-neutral-subtle'),
    'status-neutral-border': cssVar('--status-neutral-border'),

    border: hslVar('--border'),
    input: hslVar('--input'),
    'switch-unchecked': hslVar('--switch-unchecked'),
    ring: hslVar('--ring'),
    background: hslVar('--background'),
    foreground: hslVar('--foreground'),
    primary: {
      DEFAULT: hslVar('--primary'),
      foreground: hslVar('--primary-foreground'),
    },
    secondary: {
      DEFAULT: hslVar('--secondary'),
      foreground: hslVar('--secondary-foreground'),
    },
    destructive: {
      DEFAULT: hslVar('--destructive'),
      foreground: hslVar('--destructive-foreground'),
    },
    muted: {
      DEFAULT: hslVar('--muted'),
      foreground: hslVar('--muted-foreground'),
    },
    accent: {
      DEFAULT: hslVar('--accent'),
      foreground: hslVar('--accent-foreground'),
    },
    card: {
      DEFAULT: hslVar('--card'),
      foreground: hslVar('--card-foreground'),
    },
  };
}

module.exports = { createTailwindColors };
