"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = viteMetaEnvBabelPlugin;
const replaceVars = [{
  regex: /^VITE_/,
  replacement: (template, variableName) => template.expression('process.env.%%variableName%%')({
    variableName
  })
}, {
  regex: /^(NODE_ENV|MODE)$/,
  replacement: template => template.expression.ast("process.env.NODE_ENV || 'test'")
}, {
  regex: /^BASE_URL$/,
  replacement: template => template.expression.ast("'/'")
}, {
  regex: /^DEV$/,
  replacement: template => template.expression.ast("process.env.NODE_ENV !== 'production'")
}, {
  regex: /^PROD$/,
  replacement: template => template.expression.ast("process.env.NODE_ENV === 'production'")
}];

const replaceEnv = template => template.expression.ast(`{
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^VITE_/.test(k))),
    NODE_ENV: process.env.NODE_ENV || 'test',
    MODE: process.env.NODE_ENV || 'test',
    BASE_URL: '/',
    DEV: process.env.NODE_ENV !== 'production',
    PROD: process.env.NODE_ENV === 'production'
  }`);

function getReplacement(variableName, template) {
  return replaceVars.filter(({
    regex
  }) => regex.test(variableName)).map(({
    replacement
  }) => replacement(template, variableName))[0];
}

function viteMetaEnvBabelPlugin({
  template,
  types: t
}) {
  return {
    name: 'vite-meta-env',
    visitor: {
      MemberExpression(path) {
        const envNode = t.isMemberExpression(path.node.object) && path.node.object;
        const variableName = t.isIdentifier(path.node.property) && path.node.property.name;

        if (!envNode || !variableName) {
          return;
        }

        const isMetaProperty = t.isMetaProperty(envNode.object);
        const isEnvVar = t.isIdentifier(envNode.property) && envNode.property.name === 'env';

        if (!isMetaProperty || !isEnvVar) {
          return;
        }

        const replacement = getReplacement(variableName, template);

        if (replacement) {
          path.replaceWith(replacement);
        }
      },

      MetaProperty(path) {
        const envNode = t.isMemberExpression(path.parentPath.node) && path.parentPath.node;

        if (!envNode) {
          return;
        }

        const isEnvVar = t.isIdentifier(envNode.property) && envNode.property.name === 'env';

        if (!isEnvVar) {
          return;
        }

        path.parentPath.replaceWith(replaceEnv(template));
      }

    }
  };
}