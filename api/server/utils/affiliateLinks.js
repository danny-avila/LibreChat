// Use console.log for logging when not in production environment
let logger;

try {
  const schemas = require('@librechat/data-schemas');
  logger = schemas.logger;
} catch (error) {
  // Fallback logger for development/testing
  logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log
  };
}

/**
 * Amazon affiliate configuration
 */
const AFFILIATE_CONFIG = {
  enableAffiliateLinks: process.env.AFFILIATES_ENABLED === 'true'
};

function getAffiliateConfig() {
    return AFFILIATE_CONFIG;
}

/**
 * Load affiliate data from external JSON file
 */
let AFFILIATE_DATA = {};
let affiliateInjected =  false;

function loadAffiliates() {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Load the JSON file
    const affiliatesPath = path.join(__dirname, 'affiliates.json');
    const affiliatesData = JSON.parse(fs.readFileSync(affiliatesPath, 'utf8'));
    
    // Convert the affiliates array to an object keyed by name
    AFFILIATE_DATA = {};
    if (affiliatesData.affiliates && Array.isArray(affiliatesData.affiliates)) {
      affiliatesData.affiliates.forEach(affiliate => {
        if (affiliate.name) {
          AFFILIATE_DATA[affiliate.name] = affiliate;
        }
      });
    }

    logger.info('[AffiliateLinks] Loaded affiliates data from JSON file', {
      totalAffiliates: Object.keys(AFFILIATE_DATA).length,
      affiliateNames: Object.keys(AFFILIATE_DATA)
    });
    
  } catch (error) {
    logger.error('[AffiliateLinks] Error loading affiliates data from JSON file:', error);
    
    // Fallback to a minimal set of affiliates if JSON loading fails
    AFFILIATE_DATA = {
		"Real Estate Affiliate Fallback": {
			"name": "Real Estate Affiliate Fallback",
			"content": "Earn commissions by promoting products on Amazon.",
			"urlTemplate": "https://www.amazon.com/dp/{productId}/?tag=your-affiliate-id"
		}
	};

    logger.warn('[AffiliateLinks] Using fallback affiliates data due to JSON loading error');
  }
}

// Load affiliates when the module is imported
loadAffiliates();

/**
 * Reload affiliates from JSON file (useful for updates without restart)
 */
function reloadAffiliates() {
  logger.info('[AffiliateLinks] Reloading affiliates from JSON file');
  loadAffiliates();
  return {
    success: true,
    totalAffiliates: Object.keys(AFFILIATE_DATA).length,
    message: 'Affiliates reloaded successfully'
  };
}

/**
 * Get current affiliate data (useful for debugging)
 */
function getAffiliates() {
  return {
    affiliates: AFFILIATE_DATA,
    totalCount: Object.keys(AFFILIATE_DATA).length
  };
}

/**
 * Get random affiliate from affiliates
 */
function getRandomAffiliate() {
  const affiliateNames = Object.keys(AFFILIATE_DATA);
  if (affiliateNames.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * affiliateNames.length);
  const randomAffiliateName = affiliateNames[randomIndex];
  return AFFILIATE_DATA[randomAffiliateName];
}

/**
 * Inject affiliate links into response text
 * @param {string} text - The response text to process
 * @returns {string} - Text with affiliate links injected
 */
function injectAffiliateLinks(text) {
  logger.debug('[AffiliateLinks] injectAffiliateLinks called', {
    textLength: text?.length || 0,
    textPreview: text?.substring(0, 100) || '',
    enableAffiliateLinks: AFFILIATE_CONFIG.enableAffiliateLinks,
  });

  if (!AFFILIATE_CONFIG.enableAffiliateLinks || !text || typeof text !== 'string') {
    logger.debug('[AffiliateLinks] Affiliate links injection is disabled or invalid text provided.');
    return text;
  }

  if (affiliateInjected) {
    logger.debug('[AffiliateLinks] Affiliate links already injected in this session, skipping re-injection');
    return text;
  }

  try {
    let modifiedText = text;
    const affiliate = getRandomAffiliate();
    if (!affiliate) {
      logger.warn('[AffiliateLinks] No affiliates available for link injection');
      return text;
    }

    // Create affiliate link text
    const linkText = affiliate.content ? affiliate.content : `Check out ${affiliate.name}`;
    
    logger.info('[AffiliateLinks] Adding affiliate link', {
      affiliateName: affiliate.name,
      content: affiliate.content
    });
    
    // Add affiliate link with context at the end
    const contextualText = `\n\n💡 **Sponsor**: ${linkText}`;
    modifiedText += contextualText;
    
    logger.info('[AffiliateLinks] Affiliate link successfully added', {
      affiliateName: affiliate.name,
      originalLength: text.length,
      modifiedLength: modifiedText.length
    });

    affiliateInjected = true;

    return modifiedText;

  } catch (error) {
    logger.error('[AffiliateLinks] Error injecting affiliate links:', error);
    return text; // Return original text if error occurs
  }
}

function getAffiliateInjected() {
  return affiliateInjected;
}

module.exports = {
  injectAffiliateLinks,
  reloadAffiliates,
  getAffiliates,
  loadAffiliates,
  getAffiliates,
  getAffiliateInjected,
  getAffiliateConfig,
  AFFILIATE_CONFIG,
};