// ESM bundler config for React components
import { fileURLToPath } from 'url';
import alias from '@rollup/plugin-alias';
import postcss from 'rollup-plugin-postcss';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import { dirname, resolve as pathResolve } from 'path';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import pkg from './package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const plugins = [
  peerDepsExternal(),
  alias({
    entries: [{ find: '~', replacement: pathResolve(__dirname, 'src') }],
  }),
  resolve({
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    browser: true,
    preferBuiltins: false,
  }),
  replace({
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.VITE_ENABLE_LOGGER': JSON.stringify(process.env.VITE_ENABLE_LOGGER || 'false'),
    'process.env.VITE_LOGGER_FILTER': JSON.stringify(process.env.VITE_LOGGER_FILTER || ''),
    preventAssignment: true,
  }),
  commonjs(),
  postcss({
    extract: false,
    inject: true,
    minimize: process.env.NODE_ENV === 'production',
    modules: false,
    config: {
      path: './postcss.config.js',
    },
  }),
  typescript({
    tsconfig: './tsconfig.json',
    useTsconfigDeclarationDir: true,
    clean: true,
    check: false,
  }),
];

const isDev = process.env.NODE_ENV !== 'production';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: isDev ? 'inline' : true,
      exports: 'named',
    },
    {
      file: pkg.module,
      format: 'esm',
      sourcemap: isDev ? 'inline' : true,
      exports: 'named',
    },
  ],
  external: [
    ...Object.keys(pkg.peerDependencies || {}),
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ],
  preserveSymlinks: true,
  plugins,
  onwarn(warning, warn) {
    // Ignore "use client" directive warnings
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
      return;
    }
    warn(warning);
  },
};
