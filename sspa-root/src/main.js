import { registerApplication, start } from 'single-spa';

// Function to load CSS
function loadCSS(href) {
  return new Promise((resolve, reject) => {
    const existingLink = document.querySelector(`link[href="${href}"]`);
    if (existingLink) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = () => {
      console.warn(`Could not load CSS: ${href}`);
      resolve(); // Don't reject to avoid breaking the app loading
    };
    document.head.appendChild(link);
  });
}

// Register the LibreChat microfrontend
registerApplication({
  name: 'librechat',
  app: () => {
    console.log('Loading LibreChat microfrontend...');
    
    // Load both CSS and JS
    return Promise.all([
      loadCSS('/client-dist/librechat.css'),
      new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.LibreChatMicrofrontend) {
          console.log('LibreChat microfrontend already available');
          resolve(window.LibreChatMicrofrontend);
          return;
        }
        
        const script = document.createElement('script');
        script.src = '/client-dist/librechat.umd.js';
        script.onload = () => {
          console.log('LibreChat script loaded');
          if (window.LibreChatMicrofrontend) {
            console.log('LibreChat microfrontend found on window');
            resolve(window.LibreChatMicrofrontend);
          } else {
            console.error('LibreChat microfrontend not found on window object');
            reject(new Error('LibreChat microfrontend not found on window object'));
          }
        };
        script.onerror = (error) => {
          console.error('Error loading microfrontend script:', error);
          // Show a helpful error message
          const loadingContainer = document.getElementById('loading-container');
          if (loadingContainer) {
            loadingContainer.innerHTML = `
              <div style="text-align: center; padding: 20px; font-family: sans-serif;">
                <h2>LibreChat Microfrontend Not Available</h2>
                <p>Could not load the microfrontend. Please ensure:</p>
                <ol style="text-align: left; display: inline-block;">
                  <li>The client microfrontend is built: <code>cd ../client && npm run build:spa</code></li>
                  <li>The symlink exists: <code>sspa-root/public/client-dist</code></li>
                </ol>
                <p>Then refresh this page.</p>
                <details style="margin-top: 20px;">
                  <summary>Technical Details</summary>
                  <pre style="background: #f5f5f5; padding: 10px; margin: 10px 0; text-align: left;">
Error loading script: /client-dist/librechat.umd.js
                  </pre>
                </details>
              </div>
            `;
          }
          reject(error);
        };
        
        document.head.appendChild(script);
      })
    ]).then(([, microfrontend]) => {
      console.log('Microfrontend loaded successfully');
      return microfrontend;
    });
  },
  activeWhen: () => true, // Always active since this is the main app
  customProps: (name, location) => ({
    // Pass the root element to the microfrontend
    domElement: document.getElementById('root'),
    name,
    singleSpa: { name, location }
  }),
});

// Start single-spa
start({
  urlRerouteOnly: true,
});

// Handle loading state
const loadingContainer = document.getElementById('loading-container');
if (loadingContainer) {
  // Hide loading container after microfrontend loads
  window.addEventListener('single-spa:app-change', () => {
    setTimeout(() => {
      if (loadingContainer) {
        loadingContainer.style.display = 'none';
      }
    }, 500);
  });
}