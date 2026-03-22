import { DEPENDENCY_VERSIONS } from '../core';
import { cleanMermaid } from '../helpers';

export function buildMermaidDoc(code: string, isDarkMode: boolean): string {
  const cleanCode = cleanMermaid(code)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<base target="_self">
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background-color: ${isDarkMode ? '#0d1117' : '#ffffff'}; 
      color: ${isDarkMode ? '#e6edf3' : '#1f2328'};
      margin: 0; 
      padding: 0;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      position: relative;
      width: 100vw;
      height: 100vh;
    }
    #mermaid-container { 
      width: 100%;
      height: 100%;
      display: flex; 
      justify-content: center;
      align-items: center;
      overflow: hidden; /* Changed from auto to hidden for custom pan/zoom */
      cursor: grab;
      position: relative;
    }
    #mermaid-container.grabbing { cursor: grabbing; }
    .mermaid-wrapper { transform-origin: center center; transition: transform 0.1s ease-out; }
    .mermaid { display: inline-block; background: transparent; }
    
    /* Controls */
    .zoom-controls {
      position: fixed; bottom: 20px; right: 20px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 1000;
      background: ${isDarkMode ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)'};
      border: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'};
      border-radius: 8px; padding: 8px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .zoom-btn {
      width: 36px; height: 36px; border: none;
      background: ${isDarkMode ? '#374151' : '#f3f4f6'};
      color: ${isDarkMode ? '#e6edf3' : '#1f2328'};
      border-radius: 6px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: bold; transition: background 0.2s;
    }
    .zoom-btn:hover { background: ${isDarkMode ? '#4b5563' : '#e5e7eb'}; }
    .zoom-level { text-align:center; font-size:12px; color:${isDarkMode ? '#9ca3af' : '#6b7280'}; padding:4px 0; font-weight:500; }
    
    .error-display {
      background:${isDarkMode ? '#1c1917' : '#fef2f2'};
      border:2px solid ${isDarkMode ? '#991b1b' : '#ef4444'};
      border-radius:8px; padding:20px; max-width:600px;
      color:${isDarkMode ? '#fca5a5' : '#991b1b'};
      margin:20px;
      z-index: 2000;
    }
  </style>
</head>
<body>
  <div id="mermaid-container">
    <div class="mermaid-wrapper">
      <div class="mermaid"></div>
    </div>
  </div>
  <div class="zoom-controls">
    <button class="zoom-btn" id="zoom-in">+</button>
    <div class="zoom-level" id="zoom-level">100%</div>
    <button class="zoom-btn" id="zoom-out">−</button>
    <button class="zoom-btn reset-btn" id="reset">⟲</button>
  </div>
  <script type="module">
    import mermaid from "https://esm.sh/mermaid@${DEPENDENCY_VERSIONS.mermaid}";
    window.parent.postMessage({ type: 'progress', message: 'Initializing Mermaid...' }, '*');
    mermaid.initialize({
      startOnLoad: false,
      theme: '${isDarkMode ? 'dark' : 'default'}',
      securityLevel: 'strict',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      logLevel: 'error'
    });
    const graphDefinition = \`${cleanCode}\`;
    const container = document.getElementById('mermaid-container');
    const wrapper = document.querySelector('.mermaid-wrapper');
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    function updateTransform() {
      wrapper.style.transform = \`translate(\${translateX}px,\${translateY}px) scale(\${scale})\`;
      document.getElementById('zoom-level').textContent = \`\${Math.round(scale*100)}%\`;
    }
    const zoomIn = () => { scale = Math.min(scale * 1.2, 5); updateTransform(); };
    const zoomOut = () => { scale = Math.max(scale / 1.2, 0.1); updateTransform(); };
    const resetView = () => { scale = 1; translateX = 0; translateY = 0; updateTransform(); };
    document.getElementById('zoom-in').onclick = zoomIn;
    document.getElementById('zoom-out').onclick = zoomOut;
    document.getElementById('reset').onclick = resetView;
    // Pan Logic
    let isPanning = false;
    let startX = 0, startY = 0;
    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.zoom-controls')) return;
      isPanning = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      container.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      e.preventDefault();
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    });
    window.addEventListener('mouseup', () => {
      isPanning = false;
      container.classList.remove('grabbing');
    });
    
    // Wheel Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }, { passive: false });
    async function renderDiagram() {
      try {
        const el = document.querySelector('.mermaid');
        el.textContent = graphDefinition;
        
        await mermaid.run({ nodes: [el] });
        
        // Better Scaling Logic
        setTimeout(() => {
          const svg = el.querySelector('svg');
          if (svg) {
            const bbox = svg.getBBox();
            const containerW = container.clientWidth;
            const containerH = container.clientHeight;
            
            // Only shrink if it's actually bigger than the screen
            if (bbox.width > containerW || bbox.height > containerH) {
               const s = Math.min(containerW / (bbox.width + 40), containerH / (bbox.height + 40));
               scale = Math.max(s, 0.1); // Don't go microscopic
            } else {
               scale = 1;
            }
            updateTransform();
          }
          window.parent.postMessage({ type: 'artifact-ready' }, '*');
        }, 50);
      } catch (e) {
        container.innerHTML = \`<div class="error-display"><h3>Render Error</h3><pre>\${e.message}</pre></div>\`;
        window.parent.postMessage({ type: 'artifact-error', error: e.message }, '*');
      }
    }
    renderDiagram();
  </script>
</body>
</html>`;
}