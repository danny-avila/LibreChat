'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fs = require('fs');
var terser = require('@rollup/plugin-terser');
var replace = require('@rollup/plugin-replace');
var commonjs = require('@rollup/plugin-commonjs');
var resolve = require('@rollup/plugin-node-resolve');
var typescript = require('@rollup/plugin-typescript');
var peerDepsExternal = require('rollup-plugin-peer-deps-external');

// rollup.config.js

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', 'file:///home/berry13/librechat/packages/mcp/rollup.config.js'), 'utf8'));

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

exports.default = cjsBuild;
