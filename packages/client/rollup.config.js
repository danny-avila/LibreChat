// ESM bundler config for React components
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import pkg from './package.json';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import alias from '@rollup/plugin-alias';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

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
