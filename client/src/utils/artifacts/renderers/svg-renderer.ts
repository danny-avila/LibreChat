import { sanitizeSvg } from '../helpers';
import { baseHtml } from '../templates';

export function buildSvgDoc(code: string, isDarkMode: boolean) {
  const trimmed = sanitizeSvg(code.trim());
  const isFullSvg = trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');

  const content = isFullSvg
    ? trimmed
    : `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;

  const head = `
    <style>
      body {
        margin: 0; padding: 0;
        height: 100vh; width: 100vw;
        display: flex; align-items: center; justify-content: center;
        background-color: ${isDarkMode ? '#0f172a' : '#ffffff'};
        color: ${isDarkMode ? '#e2e8f0' : '#1e293b'};
        overflow: hidden;
      }
      svg {
        max-width: 95%; max-height: 95%;
        width: auto; height: auto;
      }
    </style>
  `;

  const body = `
    ${content}
    <script>
       window.onload = () => window.parent.postMessage({ type: 'artifact-ready' }, '*');
    </script>
  `;

  return baseHtml({ head, body, isDarkMode });
}