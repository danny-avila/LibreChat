const { logger } = require('@librechat/data-schemas');

/**
 * Patches the global fetch to allow specific ports that are normally blocked by undici
 * Reads allowed ports from ALLOWED_FETCH_PORTS environment variable
 */
function patchFetchPorts() {
  try {
    // Read from environment variable
    const portsToAllow = process.env.ALLOWED_FETCH_PORTS 
      ? process.env.ALLOWED_FETCH_PORTS.split(',').map(p => p.trim())
      : [];
    
    if (portsToAllow.length === 0) {
      logger.info('[patchFetch] No ports to allow specified in ALLOWED_FETCH_PORTS');
      return;
    }
    
    // Ensure portsToAllow is an array
    const ports = Array.isArray(portsToAllow) ? portsToAllow : [portsToAllow];
    
    // Get the badPorts list from the original undici module
    const badPorts = require('undici/lib/web/fetch/constants').badPorts;
    
    let removedPorts = [];
    
    // Remove specified ports from the badPorts list
    ports.forEach(port => {
      const portStr = port.toString();
      const index = badPorts.indexOf(portStr);
      if (index !== -1) {
        badPorts.splice(index, 1);
        removedPorts.push(portStr);
      }
    });
    
    // Replace global fetch with undici fetch (now with modified badPorts)
    global.fetch = require('undici').fetch;
    
    if (removedPorts.length > 0) {
      logger.info(`[patchFetch] Removed ports ${removedPorts.join(', ')} from undici badPorts list`);
    } else {
      logger.debug(`[patchFetch] No ports were removed from badPorts list`);
    }
    
    return;
  } catch (error) {
    logger.error(`[patchFetch] Failed to patch fetch: ${error.message}`);
    return;
  }
}

/**
 * Check if a port is currently in the badPorts list
 * @param {string|number} port - Port to check
 * @returns {boolean} True if port is blocked
 */
function isPortBlocked(port) {
  try {
    const badPorts = require('undici/lib/web/fetch/constants').badPorts;
    return badPorts.includes(port.toString());
  } catch (error) {
    logger.error(`[patchFetch] Failed to check port status: ${error.message}`);
    return false;
  }
}

module.exports = {
  patchFetchPorts,
  isPortBlocked,
}; 