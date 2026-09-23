const { createTailwindColors } = require('./src/theme/utils/createTailwindColors.js');
const libreChatTailwindPreset = require('./tailwind.preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class'],
  presets: [libreChatTailwindPreset],
  theme: {
    extend: {
      colors: createTailwindColors(),
    },
  },
  plugins: [],
};
