'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var json = require('@rollup/plugin-json');
var typescript = require('@rollup/plugin-typescript');
var commonjs = require('@rollup/plugin-commonjs');
var nodeResolve = require('@rollup/plugin-node-resolve');
var peerDepsExternal = require('rollup-plugin-peer-deps-external');

var rollup_config = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.es.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
    },
  ],
  plugins: [
    // Allow importing JSON files
    json(),
    // Automatically externalize peer dependencies
    peerDepsExternal(),
    // Resolve modules from node_modules
    nodeResolve(),
    // Convert CommonJS modules to ES6
    commonjs(),
    // Compile TypeScript files and generate type declarations
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist/types',
      rootDir: 'src',
      exclude: ['**/*.spec.ts', '**/*.test.ts'],
    }),
  ],
  // Do not bundle these external dependencies
  external: ['mongoose'],
};

exports.default = rollup_config;
