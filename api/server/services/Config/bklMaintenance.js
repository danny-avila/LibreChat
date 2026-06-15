const { isEnabled } = require('@librechat/api');

const DEFAULT_BKL_MAINTENANCE_UNTIL = '6월 15일(월) 12:00';

const getBklMaintenanceConfig = () => {
  const until = process.env.BKL_MAINTENANCE_UNTIL || DEFAULT_BKL_MAINTENANCE_UNTIL;
  return {
    enabled: isEnabled(process.env.BKL_MAINTENANCE_MODE),
    until,
    message:
      process.env.BKL_MAINTENANCE_MESSAGE ||
      `시스템 점검 중입니다. ${until} 이후 이용 가능합니다.`,
  };
};

module.exports = {
  getBklMaintenanceConfig,
};
