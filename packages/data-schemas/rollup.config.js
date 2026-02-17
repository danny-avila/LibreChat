import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

export default {
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
      tsconfig: './tsconfig.build.json',
      declaration: true,
      declarationDir: 'dist/types',
      rootDir: 'src',
    }),
  ],
  // Do not bundle these external dependencies
  external: ['mongoose'],
};
