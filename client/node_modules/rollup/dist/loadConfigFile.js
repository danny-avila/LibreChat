/*
  @license
	Rollup.js v4.9.6
	Sun, 21 Jan 2024 05:51:51 GMT - commit ecb6b0a430098052781aa6ee04ec92ee70960321

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

require('node:fs/promises');
require('node:path');
require('node:process');
require('node:url');
require('./shared/rollup.js');
require('./shared/parseAst.js');
const loadConfigFile_js = require('./shared/loadConfigFile.js');
require('tty');
require('path');
require('node:perf_hooks');
require('./native.js');
require('./getLogFilter.js');



exports.loadConfigFile = loadConfigFile_js.loadConfigFile;
//# sourceMappingURL=loadConfigFile.js.map
