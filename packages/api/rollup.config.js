// rollup.config.js
import { readFileSync } from 'fs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Check if we're in development mode
 */
const isDevelopment = process.env.NODE_ENV === 'development';

const plugins = [
  peerDepsExternal(),
  resolve({
    preferBuiltins: true,
    skipSelf: true,
  }),
  replace({
    __IS_DEV__: isDevelopment,
    preventAssignment: true,
  }),
  commonjs({
    transformMixedEsModules: true,
    requireReturnsDefault: 'auto',
  }),
  typescript({
    tsconfig: './tsconfig.build.json',
    outDir: './dist',
    sourceMap: true,
    /**
     * Remove inline sourcemaps - they conflict with external sourcemaps
     */
    inlineSourceMap: false,
    /**
     * Always include source content in sourcemaps for better debugging
     */
    inlineSources: true,
  }),
  json(),
];

const cjsBuild = {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
    entryFileNames: '[name].js',
    /**
     * Always include sources in sourcemap for better debugging
     */
    sourcemapExcludeSources: false,
  },
  external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})],
  preserveSymlinks: true,
  plugins,
};

export default cjsBuild;
