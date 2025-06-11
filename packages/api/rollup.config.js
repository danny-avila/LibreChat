// rollup.config.js
import { readFileSync } from 'fs';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const plugins = [
  peerDepsExternal(),
  resolve({
    preferBuiltins: true,
  }),
  replace({
    __IS_DEV__: process.env.NODE_ENV === 'development',
    preventAssignment: true,
  }),
  commonjs({
    transformMixedEsModules: true,
    requireReturnsDefault: 'auto',
  }),
  typescript({
    tsconfig: './tsconfig.json',
    outDir: './dist',
    sourceMap: true,
    inlineSourceMap: true,
  }),
  terser(),
];

const cjsBuild = {
  input: 'src/index.ts',
  output: {
    file: pkg.main,
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
  },
  external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})],
  preserveSymlinks: true,
  plugins,
};

export default cjsBuild;
