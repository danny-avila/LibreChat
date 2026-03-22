import { baseHtml } from '../templates';
import { getReactRunnerScriptTag } from './react-runner';
import { DEPENDENCY_VERSIONS } from '../core';
import type { RenderConfig } from '../artifact-builder';

export function buildReactDoc({ isDarkMode }: RenderConfig): string {

  // Static map ensures core deps are available immediately
  const coreMap = {
    imports: {
      "react": `https://esm.sh/react@${DEPENDENCY_VERSIONS.react}?dev`,
      "react-dom": `https://esm.sh/react-dom@${DEPENDENCY_VERSIONS["react-dom"]}?dev`,
      "react-dom/client": `https://esm.sh/react-dom@${DEPENDENCY_VERSIONS["react-dom"]}/client?dev`
    }
  };

  const head = `
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script>tailwind.config = { darkMode: 'class' };</script>
    
    <!-- Core Import Map (Static) -->
    <script type="importmap-shim">
      ${JSON.stringify(coreMap)}
    </script>
    
    <script src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.2/babel.min.js"></script>
    
    <style>
      body { background-color: ${isDarkMode ? '#030712' : '#ffffff'}; color-scheme: ${isDarkMode ? 'dark' : 'light'}; }
      #root { min-height: 100vh; }
    </style>
  `;

  const body = `
  <div id="root"></div>
  ${getReactRunnerScriptTag()}
  `;
  return baseHtml({ head, body, isDarkMode });
}