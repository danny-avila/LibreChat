export function linkHandlerScript() {
  return `
    <script>
      (function(){
        document.addEventListener('click', (e) => {
          const a = e.target.closest('a');
          if (!a) return;

          const href = a.getAttribute('href');
          const normalizedHref = (href || '').trim().toLowerCase();

          if (!href || normalizedHref.startsWith('javascript:')) {
            e.preventDefault();
            return;
          }

          if (href.startsWith('#')) {
            e.preventDefault();
            try {
              window.location.hash = href.slice(1);
            } catch {}
            return;
          }

          // Disable all non-hash navigation
          e.preventDefault();
        }, true);
      })();
    </script>
  `;
}


const ARTIFACT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh https://cdn.tailwindcss.com https://ga.jspm.io https://unpkg.com",
  "connect-src blob: https://esm.sh https://cdn.tailwindcss.com https://ga.jspm.io https://unpkg.com",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "img-src data: blob: https:",
  "font-src data: https:",
].join('; ');

export function baseHtml({ head = '', body = '', isDarkMode = false }) {
  return `<!DOCTYPE html>
<base target="_self">
<html lang="en" class="${isDarkMode ? 'dark' : ''}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}" />
${head}
</head>
<body>
${body}
${linkHandlerScript()}
</body>
</html>`;
}