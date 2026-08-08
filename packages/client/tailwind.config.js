const { createTailwindColors } = require('./src/theme/utils/createTailwindColors.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class'],
  theme: {
    fontFamily: {
      'theme-ui': ['var(--theme-font-family, Inter, sans-serif)'],
    },
    extend: {
      colors: createTailwindColors(),
      height: {
        'theme-control': 'var(--theme-control-height, 2.25rem)',
      },
      spacing: {
        'theme-compact': 'var(--theme-space-compact, 0.375rem)',
        'theme-normal': 'var(--theme-space-normal, 0.75rem)',
        'theme-control': 'var(--theme-control-height, 2.25rem)',
      },
      borderRadius: {
        'theme-control': 'var(--theme-control-radius, 9999px)',
        'theme-surface': 'var(--theme-surface-radius, 1.5rem)',
      },
      boxShadow: {
        'theme-surface': 'var(--theme-elevation-surface, 0 10px 15px -3px rgb(0 0 0 / 0.1))',
      },
      transitionDuration: {
        'theme-fast': 'var(--theme-motion-fast, 150ms)',
        'theme-normal': 'var(--theme-motion-normal, 200ms)',
      },
    },
  },
  plugins: [],
};
