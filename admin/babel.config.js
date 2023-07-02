module.exports = {
  presets: [
    ["@babel/preset-env", { "targets": { "node": "current" } }], //compiling ES2015+ syntax
    ['@babel/preset-react', {runtime: 'automatic'}],
    "@babel/preset-typescript"
  ],
  /*
      Babel's code transformations are enabled by applying plugins (or presets) to your configuration file.
  */
  plugins: [
    "@babel/plugin-transform-runtime",
    'babel-plugin-transform-import-meta',
    'babel-plugin-transform-vite-meta-env',
    'babel-plugin-replace-ts-export-assignment',
    [
      "babel-plugin-root-import",
      {
        "rootPathPrefix": "~/",
        "rootPathSuffix": "./src"
      }
    ]
  ]
}
