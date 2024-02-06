'use client';
import { ReactQueryDevtools as ReactQueryDevtools$1, ReactQueryDevtoolsPanel as ReactQueryDevtoolsPanel$1 } from './devtools.esm.js';

const ReactQueryDevtools = process.env.NODE_ENV !== 'development' ? function () {
  return null;
} : ReactQueryDevtools$1;
const ReactQueryDevtoolsPanel = process.env.NODE_ENV !== 'development' ? function () {
  return null;
} : ReactQueryDevtoolsPanel$1;

export { ReactQueryDevtools, ReactQueryDevtoolsPanel };
//# sourceMappingURL=index.esm.js.map
