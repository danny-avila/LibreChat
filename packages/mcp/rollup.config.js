// rollup.config.js
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

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
    useTsconfigDeclarationDir: true,
  }),
  terser(),
];

const esmBuild = {
  input: 'src/index.ts',
  output: {
    file: pkg.module,
    format: 'esm',
    sourcemap: true,
    exports: 'named',
  },
  external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})],
  preserveSymlinks: true,
  plugins,
};

export default esmBuild;
