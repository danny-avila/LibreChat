const libreChatTailwindPreset = require('./tailwind.preset.cjs');

/**
 * The library's own Tailwind config, used when developing and testing the package in isolation.
 * Colors are not here: they are declared in `src/theme/tokens.css`, published as
 * `@librechat/client/theme.css`, so an app imports them from CSS rather than merging a JS object.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class'],
  presets: [libreChatTailwindPreset],
  // The components here write `animate-in`, `fade-in-0`, `slide-in-from-*` and the accordion
  // keyframes, so the plugin that generates them belongs in the library's own config rather than
  // only in the app's.
  plugins: [require('tailwindcss-animate')],
};
