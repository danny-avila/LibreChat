import path from 'path';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import babel from '@rollup/plugin-babel';

const rootPath = path.resolve(__dirname, '../../');
const rootServerPath = path.resolve(__dirname, '../../api');
const entryPath = path.resolve(rootPath, 'api/server/index.js');

console.log('entryPath', entryPath);

// Define your custom aliases here
const customAliases = {
  entries: [{ find: '~', replacement: rootServerPath }],
};

export default {
  input: entryPath,
  output: {
    file: 'test_bundle/bundle.js',
    format: 'cjs',
  },
  plugins: [
    alias(customAliases),
    resolve({
      preferBuiltins: true,
      extensions: ['.js', '.json', '.node'],
    }),
    commonjs(),
    json(),
    babel({
      exclude: 'node_modules/**',
      babelHelpers: 'bundled',
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
      plugins: [
        '@babel/plugin-syntax-dynamic-import',
        '@babel/plugin-proposal-nullish-coalescing-operator',
        '@babel/plugin-proposal-optional-chaining',
      ],
    }),
  ],
  external: (id) => {
    // More selective external function
    if (/node_modules/.test(id)) {
      return !id.startsWith('langchain/');
    }
    return false;
  },
};
