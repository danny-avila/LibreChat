import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import alias from '@rollup/plugin-alias';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

const require = createRequire(import.meta.url);
const rootPkg = require('../../package.json');
const dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(dirname, 'src');

const isExternal = (id) =>
  !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('src/');

const plugins = [
  replace({
    preventAssignment: true,
    values: {
      __IS_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
      __LIBRECHAT_VERSION__: JSON.stringify(rootPkg.version),
    },
  }),
  alias({ entries: [{ find: 'src', replacement: srcDir }] }),
  nodeResolve({ extensions: ['.ts', '.js', '.json'] }),
  commonjs(),
  json(),
  babel({
    babelHelpers: 'bundled',
    extensions: ['.ts', '.js'],
    presets: [
      ['@babel/preset-env', { targets: { node: '18' }, modules: false }],
      '@babel/preset-typescript',
    ],
  }),
];

export default [
  {
    input: {
      index: 'src/index.ts',
      'react-query/index': 'src/react-query/index.ts',
    },
    external: isExternal,
    plugins,
    output: [
      { dir: 'dist', format: 'cjs', entryFileNames: '[name].js', exports: 'named' },
      { dir: 'dist', format: 'es', entryFileNames: '[name].mjs' },
    ],
  },
];
