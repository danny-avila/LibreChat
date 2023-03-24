// const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // darkMode: 'class',
  darkMode: ['class'],
  theme: {
    // colors: {
    //   'gpt-dark-gray': '#343541',
    // },
    extend: {
      // fontFamily: {
      //   sans: ['var(--font-sans)', ...fontFamily.sans]
      // },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      },
      colors: {
        gray: {
          '50': '#f7f7f8',
          '100': '#d9d9e3',
          '200': '#d9d9e3', // Replacing .bg-gray-200
          '300': '#c5c5d2',
          '400': '#acacb1',
          '500': '#8e8ea0',
          '600': '#565869',
          '700': '#40414f', // Replacing .dark .dark:bg-gray-700 and .dark .dark:hover:bg-gray-700:hover
          '800': '#343541', // Replacing .dark .dark:bg-gray-800, .bg-gray-800, and .dark .dark:hover:bg-gray-800\/90
          '900': '#202123' // Replacing .dark .dark:bg-gray-900, .bg-gray-900, and .dark .dark:hover:bg-gray-900:hover
        }
    }
    }
  },
  plugins: [
    require('tailwindcss-animate'),
    require("tailwindcss-radix")(),
    // require('@tailwindcss/typography'),
  ]
};
