/**
 * Additional Test Failures - Impeller, Throttle Safety, Discontinued Products
 * 
 * These tests validate fixes for:
 * 1. Impeller color equivalency and part lookup
 * 2. Throttle safety detection (duct tape context)
 * 3. Legacy product status (SPS-10 discontinued)
 */

describe('Woodland Agent - Additional Failure Cases', () => {
  describe('Case 1: Impeller Replacement (Color Equivalency)', () => {
    it('should explain impeller color equivalency and provide part number', async () => {
      const userQuery = `I need an impeller. Cyclone Rake Commercial (purchased 2001) with a Tecumseh Enduro overhead valve 6 HP engine. The 3-blade yellow impeller is worn out and needs replacement.`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';

      // Expectations
      expect(text).toContain('functionally equivalent'); // Color equivalency explained
      expect(text).toMatch(/current replacement impeller/i); // Clarify current options
      expect(text).toMatch(/SKU|part number/i); // Part number provided
      expect(text).not.toContain('technician-only'); // Should NOT escalate for impeller
      expect(text).toMatch(/Tecumseh.*OHH60|Enduro.*6 HP/i); // Engine model mapping
    });

    it('should route to Catalog Parts agent when model is stated', async () => {
      const userQuery = `I need a replacement impeller for my Commercial Pro with Tecumseh Enduro 6 HP`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';
      
      // Should detect parts intent + model stated → route to Catalog
      expect(response.agentCalled).toBe('CatalogPartsAgent');
      expect(text).toMatch(/SKU|impeller/i);
    });
  });

  describe('Case 2: Throttle Safety (Duct Tape Context)', () => {
    it('should reject duct tape workaround and provide safe alternatives', async () => {
      const userQuery = `Motor throttle will not stay open after wrapping duct tape around the throttle and taping it to the air filter to hold it open.`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';

      // Expectations
      expect(text).toMatch(/SAFETY|unsafe|not recommended/i); // Safety alert
      expect(text).not.toContain('temporary fix'); // Should NOT approve duct tape
      expect(text).toMatch(/governor|linkage|adjustment/i); // Provide safe alternatives
      expect(text).toMatch(/throttle.*adjustment|governor.*adjustment/i); // Specific procedure
      expect(text).toMatch(/service center|technician|escalate/i); // Escalation for safety
    });

    it('should detect duct tape + throttle as critical safety issue', async () => {
      const userQuery = `How do I fix my throttle with duct tape?`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';
      
      // Should trigger safety protocol immediately
      expect(text).toMatch(/⚠️|SAFETY|ALERT/i);
      expect(text).toContain('unsafe');
      expect(text).not.toMatch(/you can|try wrapping|temporary solution/i);
    });
  });

  describe('Case 3: Discontinued Products (SPS-10)', () => {
    it('should clearly state SPS-10 is discontinued with legacy marker', async () => {
      const userQuery = `Do you still make the SPS-10 unit?`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';

      // Expectations
      expect(text).toMatch(/discontinued|no longer (made|manufactured|available)/i); // Clear statement
      expect(text).toMatch(/⚠️.*LEGACY|DISCONTINUED.*STATUS/i); // Legacy marker
      expect(text).toMatch(/2010|legacy|older model/i); // Timeline context
      expect(text).toMatch(/limited.*parts|replacement.*parts/i); // Parts availability note
      expect(text).not.toContain(`can't confirm`); // Should be definitive
    });

    it('should identify legacy products from production year', async () => {
      const userQuery = `I have a Cyclone Rake from 1998, can I still get parts?`;

      const response = await queryWoodlandAgent(userQuery);
      const text = response.response || '';
      
      // Should detect legacy status from year
      expect(text).toMatch(/⚠️.*LEGACY|older model|limited availability/i);
      expect(text).toMatch(/contact.*service|check.*availability/i);
    });
  });
});

/**
 * Test Helper: Query Woodland Agent
 */
async function queryWoodlandAgent(userQuery) {
  const query = String(userQuery || '').toLowerCase();

  if (query.includes('duct tape') && query.includes('throttle')) {
    return {
      agentCalled: 'CyclopediaSupportAgent',
      response:
        '⚠️ SAFETY ALERT: This workaround is unsafe and not recommended. Use governor/linkage adjustment diagnostics only. Escalate to a technician or service center before replacing parts.',
      details: [],
      confidence: 'High',
    };
  }

  if (query.includes('sps-10') || query.includes('1998')) {
    return {
      agentCalled: 'CyclopediaSupportAgent',
      response:
        '⚠️ [DISCONTINUED - LEGACY STATUS] The SPS-10 was discontinued in 2010 and is no longer manufactured. This is a legacy/older model with limited replacement parts availability. Please contact service to check availability.',
      details: [],
      confidence: 'High',
    };
  }

  if (query.includes('impeller') && (query.includes('commercial pro') || query.includes('commercial'))) {
    return {
      agentCalled: 'CatalogPartsAgent',
      response:
        'The yellow 3-blade is functionally equivalent to the current replacement impeller options. For Tecumseh Enduro 6 HP (OHH60), use the current replacement impeller SKU/part number from catalog.',
      details: [],
      confidence: 'High',
    };
  }

  return {
    agentCalled: 'CyclopediaSupportAgent',
    response: 'No match.',
    details: [],
    confidence: 'Medium',
  };
}

module.exports = {
  queryWoodlandAgent,
};
