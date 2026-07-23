import path from 'node:path';
import { fileURLToPath } from 'node:url';
import alias from '@rollup/plugin-alias';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(dirname, 'src');

const isExternal = (id) =>
  !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('~/') && !id.startsWith('src/');

const plugins = [
  alias({ entries: [{ find: /^~\//, replacement: `${srcDir}/` }] }),
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
      'admin/capabilities': 'src/admin/capabilities.ts',
    },
    external: isExternal,
    plugins,
    output: [
      { dir: 'dist', format: 'cjs', entryFileNames: '[name].cjs', exports: 'named' },
      { dir: 'dist', format: 'es', entryFileNames: '[name].mjs' },
    ],
  },
];
