'use client';
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var devtools = require('./devtools.js');

const ReactQueryDevtools = process.env.NODE_ENV !== 'development' ? function () {
  return null;
} : devtools.ReactQueryDevtools;
const ReactQueryDevtoolsPanel = process.env.NODE_ENV !== 'development' ? function () {
  return null;
} : devtools.ReactQueryDevtoolsPanel;

exports.ReactQueryDevtools = ReactQueryDevtools;
exports.ReactQueryDevtoolsPanel = ReactQueryDevtoolsPanel;
//# sourceMappingURL=index.js.map
