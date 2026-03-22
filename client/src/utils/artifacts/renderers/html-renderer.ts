import { baseHtml, linkHandlerScript } from '../templates';


export function buildHtmlDoc(code: string, isDarkMode: boolean): string {
  const hasFullDoc = /<html[\s>]/i.test(code) || /<body[\s>]/i.test(code);

  if (hasFullDoc) {
    const readyScript = `
      <script>
        window.addEventListener('load', () => {
          window.parent.postMessage({ type: 'artifact-ready' }, '*');
        });
      </script>
    `;

    if (/<\/body>/i.test(code)) {
      return code.replace(/<\/body>/i, `${readyScript}${linkHandlerScript()}</body>`);
    }
    return code + readyScript + linkHandlerScript();
  }

  return baseHtml({
    isDarkMode,
    head: `
       <script src="https://cdn.tailwindcss.com/3.4.17"></script>
       <script>
         tailwind.config = { darkMode: 'class' };
         window.onload = () => window.parent.postMessage({ type: 'artifact-ready' }, '*');
       </script>
       <style>
         body {
           margin: 0;
           padding: 0;
           background-color: ${isDarkMode ? '#030712' : '#ffffff'};
           color-scheme: ${isDarkMode ? 'dark' : 'light'};
           font-family: system-ui, sans-serif;
         }
       </style>
     `,
    body: code
  });
}