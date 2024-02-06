/*
  @license
	Rollup.js v4.9.6
	Sun, 21 Jan 2024 05:51:51 GMT - commit ecb6b0a430098052781aa6ee04ec92ee70960321

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
export { version as VERSION, defineConfig, rollup, watch } from './shared/node-entry.js';
import './shared/parseAst.js';
import '../native.js';
import 'node:path';
import 'path';
import 'node:process';
import 'node:perf_hooks';
import 'node:fs/promises';
import 'tty';
