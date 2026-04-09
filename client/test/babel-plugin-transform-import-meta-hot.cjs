/**
 * Babel plugin that replaces `import.meta.hot` with `undefined`.
 *
 * `babel-plugin-transform-import-meta` handles standard properties (url,
 * filename, dirname, resolve) but does NOT handle the Vite-specific `hot`
 * property.  Jest runs in CommonJS/Node where `import.meta` is unavailable,
 * so any reference to `import.meta.hot` causes a SyntaxError.
 *
 * Replacing it with `undefined` makes the HMR guard blocks dead-code:
 *   import.meta.hot?.data  →  undefined?.data  →  undefined
 *   if (import.meta.hot)   →  if (undefined)   →  skipped
 */
module.exports = function transformImportMetaHot() {
  return {
    name: 'transform-import-meta-hot',
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'hot'
        ) {
          path.replaceWith({ type: 'Identifier', name: 'undefined' });
        }
      },
    },
  };
};
