const { SystemRoles } = require('librechat-data-provider');
const { tierConfig } = require('./tiers');

describe('Tier Configuration', () => {
  it('should have configuration for all system roles', () => {
    expect(tierConfig[SystemRoles.USER]).toBeDefined();
    expect(tierConfig[SystemRoles.BASIC]).toBeDefined();
    expect(tierConfig[SystemRoles.PRO]).toBeDefined();
    expect(tierConfig[SystemRoles.ADMIN]).toBeDefined();
  });

  it('should have correct structure for each tier', () => {
    Object.values(SystemRoles).forEach((role) => {
      const config = tierConfig[role];
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('startBalance');
      expect(config).toHaveProperty('autoRefillEnabled');
      expect(config).toHaveProperty('refillIntervalValue');
      expect(config).toHaveProperty('refillIntervalUnit');
      expect(config).toHaveProperty('refillAmount');
    });
  });

  it('should have enabled set to true for all tiers', () => {
    Object.values(SystemRoles).forEach((role) => {
      expect(tierConfig[role].enabled).toBe(true);
    });
  });

  describe('USER tier', () => {
    it('should have correct token balance', () => {
      expect(tierConfig[SystemRoles.USER].startBalance).toBe(100000);
      expect(tierConfig[SystemRoles.USER].refillAmount).toBe(100000);
    });

    it('should have auto-refill enabled', () => {
      expect(tierConfig[SystemRoles.USER].autoRefillEnabled).toBe(true);
    });

    it('should have 30-day refill interval', () => {
      expect(tierConfig[SystemRoles.USER].refillIntervalValue).toBe(30);
      expect(tierConfig[SystemRoles.USER].refillIntervalUnit).toBe('days');
    });
  });

  describe('BASIC tier', () => {
    it('should have correct token balance (20x USER)', () => {
      expect(tierConfig[SystemRoles.BASIC].startBalance).toBe(2000000);
      expect(tierConfig[SystemRoles.BASIC].refillAmount).toBe(2000000);
      expect(tierConfig[SystemRoles.BASIC].startBalance).toBe(
        tierConfig[SystemRoles.USER].startBalance * 20,
      );
    });

    it('should have auto-refill enabled', () => {
      expect(tierConfig[SystemRoles.BASIC].autoRefillEnabled).toBe(true);
    });

    it('should have 30-day refill interval', () => {
      expect(tierConfig[SystemRoles.BASIC].refillIntervalValue).toBe(30);
      expect(tierConfig[SystemRoles.BASIC].refillIntervalUnit).toBe('days');
    });
  });

  describe('PRO tier', () => {
    it('should have correct token balance (200x USER)', () => {
      expect(tierConfig[SystemRoles.PRO].startBalance).toBe(20000000);
      expect(tierConfig[SystemRoles.PRO].refillAmount).toBe(20000000);
      expect(tierConfig[SystemRoles.PRO].startBalance).toBe(
        tierConfig[SystemRoles.USER].startBalance * 200,
      );
    });

    it('should have auto-refill enabled', () => {
      expect(tierConfig[SystemRoles.PRO].autoRefillEnabled).toBe(true);
    });

    it('should have 30-day refill interval', () => {
      expect(tierConfig[SystemRoles.PRO].refillIntervalValue).toBe(30);
      expect(tierConfig[SystemRoles.PRO].refillIntervalUnit).toBe('days');
    });
  });

  describe('ADMIN tier', () => {
    it('should have highest token balance', () => {
      expect(tierConfig[SystemRoles.ADMIN].startBalance).toBe(100000000);
      expect(tierConfig[SystemRoles.ADMIN].refillAmount).toBe(100000000);
      expect(tierConfig[SystemRoles.ADMIN].startBalance).toBeGreaterThan(
        tierConfig[SystemRoles.PRO].startBalance,
      );
    });

    it('should have auto-refill disabled (admins do not need refills)', () => {
      expect(tierConfig[SystemRoles.ADMIN].autoRefillEnabled).toBe(false);
    });

    it('should have 30-day refill interval (even if disabled)', () => {
      expect(tierConfig[SystemRoles.ADMIN].refillIntervalValue).toBe(30);
      expect(tierConfig[SystemRoles.ADMIN].refillIntervalUnit).toBe('days');
    });
  });

  describe('Tier hierarchy', () => {
    it('should maintain ascending token balance: USER < BASIC < PRO < ADMIN', () => {
      const userBalance = tierConfig[SystemRoles.USER].startBalance;
      const basicBalance = tierConfig[SystemRoles.BASIC].startBalance;
      const proBalance = tierConfig[SystemRoles.PRO].startBalance;
      const adminBalance = tierConfig[SystemRoles.ADMIN].startBalance;

      expect(basicBalance).toBeGreaterThan(userBalance);
      expect(proBalance).toBeGreaterThan(basicBalance);
      expect(adminBalance).toBeGreaterThan(proBalance);
    });

    it('should have matching startBalance and refillAmount for each tier', () => {
      Object.values(SystemRoles).forEach((role) => {
        const config = tierConfig[role];
        expect(config.startBalance).toBe(config.refillAmount);
      });
    });
  });

  describe('Balance configuration compatibility', () => {
    it('should be compatible with createUser balance config structure', () => {
      const config = tierConfig[SystemRoles.USER];

      // Verify it has all required properties that createUser expects
      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.startBalance).toBe('number');
      expect(typeof config.autoRefillEnabled).toBe('boolean');
      expect(typeof config.refillIntervalValue).toBe('number');
      expect(typeof config.refillIntervalUnit).toBe('string');
      expect(typeof config.refillAmount).toBe('number');
    });

    it('should have numeric values for all balance-related fields', () => {
      Object.values(SystemRoles).forEach((role) => {
        const config = tierConfig[role];
        expect(config.startBalance).toBeGreaterThan(0);
        expect(config.refillAmount).toBeGreaterThan(0);
        expect(config.refillIntervalValue).toBeGreaterThan(0);
      });
    });

    it('should have valid refillIntervalUnit values', () => {
      Object.values(SystemRoles).forEach((role) => {
        const config = tierConfig[role];
        expect(['days', 'hours', 'weeks', 'months']).toContain(config.refillIntervalUnit);
      });
    });
  });
});
