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
  // peerDepsExternal(), // Temporarily disabled to bundle dependencies for main app
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
  terser({
    compress: {
      directives: false,
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
  external: [
    // Only externalize React/React-DOM to avoid bundling them twice
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    // External these heavy deps that are already in main client
    '@tanstack/react-query',
    '@tanstack/react-table',
    '@tanstack/react-virtual',
    // Externalize Radix UI and Ariakit to prevent duplicate context instances
    // (two copies of the same lib = context mismatches at runtime)
    '@radix-ui/react-accordion',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-checkbox',
    '@radix-ui/react-collapsible',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-hover-card',
    '@radix-ui/react-icons',
    '@radix-ui/react-label',
    '@radix-ui/react-progress',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-select',
    '@radix-ui/react-separator',
    '@radix-ui/react-slider',
    '@radix-ui/react-slot',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-toast',
    '@ariakit/react',
    '@ariakit/react-core',
    '@headlessui/react',
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
