const { SystemRoles } = require('librechat-data-provider');

const tierConfig = {
  [SystemRoles.USER]: {
    enabled: true,
    startBalance: 100000,
    autoRefillEnabled: true,
    refillIntervalValue: 30,
    refillIntervalUnit: 'days',
    refillAmount: 100000,
  },
  [SystemRoles.BASIC]: {
    enabled: true,
    startBalance: 2000000,
    autoRefillEnabled: true,
    refillIntervalValue: 30,
    refillIntervalUnit: 'days',
    refillAmount: 2000000,
  },
  [SystemRoles.PRO]: {
    enabled: true,
    startBalance: 20000000,
    autoRefillEnabled: true,
    refillIntervalValue: 30,
    refillIntervalUnit: 'days',
    refillAmount: 20000000,
  },
  [SystemRoles.ADMIN]: {
    enabled: true,
    startBalance: 100000000,
    autoRefillEnabled: false,
    refillIntervalValue: 30,
    refillIntervalUnit: 'days',
    refillAmount: 100000000,
  },
};

module.exports = { tierConfig };
