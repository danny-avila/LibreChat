const { createTailwindColors } = require('./src/theme/utils/createTailwindColors.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: createTailwindColors(),
    },
  },
  plugins: [],
};
