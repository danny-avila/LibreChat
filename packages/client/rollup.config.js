// ESM bundler config for React components
import { fileURLToPath } from 'url';
import alias from '@rollup/plugin-alias';
import terser from '@rollup/plugin-terser';
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
  }),
  replace({
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    preventAssignment: true,
  }),
  commonjs(),
  postcss({
    // Extract CSS to a separate file
    extract: false,
    // Inject CSS into JS (better for component libraries)
    inject: true,
    // Minimize CSS in production
    minimize: process.env.NODE_ENV === 'production',
    // Enable CSS modules if needed
    modules: false,
  }),
  typescript({
    tsconfig: './tsconfig.json',
    useTsconfigDeclarationDir: true,
    clean: true,
  }),
  terser({
    compress: {
      directives: false, // Preserve directives like 'use client'
    },
  }),
];

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: pkg.module,
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
  ],
  external: [...Object.keys(pkg.peerDependencies || {}), 'react/jsx-runtime'],
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
