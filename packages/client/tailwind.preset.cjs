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
        /**
         * The comfortable tap target (2.75rem / 44px), held against the theme's
         * own control height with `max()` so a theme that already draws larger
         * controls is never shrunk on a phone. Pair it with `touch:`.
         */
        'theme-control-touch': 'max(var(--theme-control-height, 2.25rem), 2.75rem)',
      },
      borderRadius: {
        /**
         * Tailwind 4 renamed the radius steps: the old `sm` (0.125rem) is now
         * `xs`, and `sm` means 0.25rem. Every published primitive that says
         * `rounded-sm` — the checkbox, the menu items, the resize grips — would
         * double its corners for a consumer who upgrades Tailwind under it, so
         * the three named steps are pinned to what this preset produced before.
         * The fallbacks stay in `rem`, and so does what is subtracted from
         * them: mixing in `px` would only reproduce the old scale at a 16px
         * root font size, and `sm` would go negative below it. Setting
         * `--radius` retunes all three; the SPA sets 0.5rem and restates the
         * same family in its own config, so nothing there moves either.
         */
        lg: 'var(--radius, 0.5rem)',
        md: 'calc(var(--radius, 0.5rem) - 0.125rem)',
        sm: 'calc(var(--radius, 0.5rem) - 0.375rem)',
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
      /**
       * The keyframes the published components name themselves: `Accordion`
       * writes `animate-accordion-up`/`-down` and `InputOTP` writes
       * `animate-caret-blink`. They live here rather than only in the app's
       * config, because a consumer loads this preset and nothing else — and an
       * accordion that never animates its height is the kind of miss that looks
       * like a styling opinion rather than a missing utility.
       */
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
    },
  },
  plugins: [
    /**
     * The published components write `animate-in`, `fade-in-0`, `zoom-in-95` and
     * `slide-in-from-*` (dialogs, popovers, dropdowns), which this plugin owns.
     * It belongs in the preset rather than in the app's config alone: a consumer
     * following the documented setup loads only this file, and without it those
     * classes generate nothing and the surfaces appear without their motion.
     * Declared as a peer dependency so the consumer's install provides it.
     */
    require('tailwindcss-animate'),
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

      /**
       * Touch is reachable at all — `any-pointer`, deliberately not `pointer`.
       * `pointer` describes only the PRIMARY pointing device, so a 2-in-1 driven
       * by its trackpad reports `fine` with its touchscreen right there, and a
       * tap-target floor written against `(pointer: coarse)` would never reach
       * the finger it exists for.
       *
       * Not the query `useFocusChatEffect` and the composer's focus guard branch
       * on, though it looks like it: those ask "would focusing raise an on-screen
       * keyboard over the thread", which is a question about the primary input and
       * must keep answering `fine` for the trackpad user on that same 2-in-1. A
       * tap target asks the other question — whether a finger can reach the
       * control at all — so the two queries differ on purpose.
       */
      addVariant('touch', '@media (any-pointer: coarse)');
    },
  ],
};
