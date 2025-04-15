import path from 'path';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';

const rootPath = path.resolve(__dirname, '../../');
const rootServerPath = path.resolve(__dirname, '../../api');
const entryPath = path.resolve(rootPath, 'api/server/index.js');

console.log('entryPath', entryPath);

// Define custom aliases here
const customAliases = {
  entries: [{ find: '~', replacement: rootServerPath }],
};

export default {
  input: entryPath,
  output: {
    dir: 'test_bundle',
    format: 'es',
  },
  plugins: [
    alias(customAliases),
    resolve({
      preferBuiltins: true,
      extensions: ['.js', '.json', '.node'],
    }),
    commonjs(),
    json(),
  ],
  external: (id) => {
    // More selective external function
    if (/node_modules/.test(id)) {
      return !id.startsWith('langchain/');
    }
    return false;
  },
};
