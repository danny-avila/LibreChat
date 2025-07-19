module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      stage: 1,
      features: {
        'nesting-rules': true,
        'custom-media-queries': true,
        'custom-properties': true,
        'is-pseudo-class': false,
      },
      autoprefixer: {
        flexbox: 'no-2009',
      },
    }),
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
