// v0.7.6
module.exports = {
  tailwindConfig: './client/tailwind.config.cjs',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  embeddedLanguageFormatting: 'auto',
  insertPragma: false,
  proseWrap: 'preserve',
  quoteProps: 'as-needed',
  requirePragma: false,
  rangeStart: 0,
  endOfLine: 'auto',
  jsxSingleQuote: false,
  plugins: ['prettier-plugin-tailwindcss'],
  overrides: [
    {
      files: ['*.yaml', '*.yml'],
      options: {
        singleQuote: false,
      },
    },
  ],
};
