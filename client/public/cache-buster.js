// Cache busting utility for icon updates
(function() {
  const CACHE_VERSION = '2025.1';
  const STORAGE_KEY = 'icon-cache-version';
  
  // Check if we need to clear the cache
  const currentVersion = localStorage.getItem(STORAGE_KEY);
  
  if (currentVersion !== CACHE_VERSION) {
    // Clear various browser caches
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.update();
        }
      });
    }
    
    // Clear application cache if it exists
    if ('applicationCache' in window) {
      applicationCache.update();
    }
    
    // Force reload of favicon
    const links = document.querySelectorAll('link[rel*="icon"]');
    links.forEach(link => {
      const href = link.href;
      link.href = href + (href.includes('?') ? '&' : '?') + 'v=' + CACHE_VERSION;
    });
    
    // Update stored version
    localStorage.setItem(STORAGE_KEY, CACHE_VERSION);
    
    console.log('Icons cache updated to version:', CACHE_VERSION);
  }
})();
