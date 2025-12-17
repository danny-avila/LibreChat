module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    'babel-plugin-replace-ts-export-assignment',
    // Transform import.meta.env for Jest (used by Vite-style code)
    function () {
      return {
        visitor: {
          MetaProperty(path) {
            if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
              path.replaceWithSourceString(`({
                env: { MODE: 'test', DEV: true, PROD: false }
              })`);
            }
          },
        },
      };
    },
  ],
};
