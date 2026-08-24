/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'theme-ui': ['var(--theme-font-family, Inter, sans-serif)'],
      },
      height: {
        'theme-control': 'var(--theme-control-height, 2.25rem)',
      },
      spacing: {
        'theme-compact': 'var(--theme-space-compact, 0.375rem)',
        'theme-normal': 'var(--theme-space-normal, 0.75rem)',
        'theme-control': 'var(--theme-control-height, 2.25rem)',
      },
      borderRadius: {
        'theme-control': 'var(--theme-control-radius, 0.75rem)',
        'theme-control-round': 'var(--theme-round-control-radius, 9999px)',
        'theme-surface': 'var(--theme-surface-radius, 1rem)',
        'theme-surface-lg': 'var(--theme-large-surface-radius, 1.5rem)',
      },
      boxShadow: {
        'theme-surface':
          'var(--theme-elevation-surface, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))',
      },
      transitionDuration: {
        'theme-fast': 'var(--theme-motion-fast, 150ms)',
        'theme-normal': 'var(--theme-motion-normal, 200ms)',
      },
    },
  },
  plugins: [
    /**
     * A bare function rather than `plugin()` from `tailwindcss/plugin`, because
     * this preset ships as a raw file through the `./tailwind-preset` export and
     * `tailwindcss` is a devDependency here. Requiring it would fail to resolve
     * for an external consumer under pnpm or Yarn PnP. Tailwind accepts a plain
     * function in `plugins`; the wrapper only adds option and config handling
     * this variant does not need.
     */
    ({ addVariant }) => {
      /**
       * Styling that applies only in the high contrast appearance modes, the
       * same way `dark:` applies only under the `dark` class. Distinct from
       * Tailwind's built-in `contrast-more:`, which is the raw
       * `prefers-contrast: more` media query: this follows the resolved app
       * mode, so it covers an explicit `high-contrast-light` /
       * `high-contrast-dark` choice as well as the OS preference.
       */
      addVariant('high-contrast', 'html.high-contrast &');
    },
  ],
};
