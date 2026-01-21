/**
 * Middleware to validate time range parameters for admin dashboard queries.
 * Validates start and end date parameters, ensures start date <= end date,
 * and parses preset time ranges (today, last7days, etc.).
 *
 * @function validateTimeRange
 * @param {Express.Request} req - Express request object containing query parameters
 * @param {Express.Response} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
function validateTimeRange(req, res, next) {
  try {
    const { startDate, endDate, preset } = req.query;

    // If preset is provided, parse it and set start/end dates
    if (preset) {
      const now = new Date();
      let start;
      let end = now;

      switch (preset) {
        case 'today':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'last7days':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last30days':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last90days':
          start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'custom':
          // Custom preset requires explicit startDate and endDate
          if (!startDate || !endDate) {
            return res.status(400).json({
              error: {
                code: 'INVALID_TIME_RANGE',
                message: 'Custom preset requires both startDate and endDate parameters',
              },
              timestamp: new Date(),
            });
          }
          break;
        default:
          return res.status(400).json({
            error: {
              code: 'INVALID_PRESET',
              message: `Invalid preset value: ${preset}. Valid values are: today, last7days, last30days, last90days, custom`,
            },
            timestamp: new Date(),
          });
      }

      // Set parsed dates on request object for preset (except custom)
      if (preset !== 'custom') {
        req.timeRange = {
          start,
          end,
          preset,
        };
        return next();
      }
    }

    // Validate custom date range
    if (startDate || endDate) {
      // Both dates must be provided
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TIME_RANGE',
            message: 'Both startDate and endDate must be provided',
          },
          timestamp: new Date(),
        });
      }

      // Parse dates
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Validate date parsing
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          error: {
            code: 'INVALID_START_DATE',
            message: `Invalid startDate format: ${startDate}`,
          },
          timestamp: new Date(),
        });
      }

      if (isNaN(end.getTime())) {
        return res.status(400).json({
          error: {
            code: 'INVALID_END_DATE',
            message: `Invalid endDate format: ${endDate}`,
          },
          timestamp: new Date(),
        });
      }

      // Ensure start date <= end date
      if (start > end) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TIME_RANGE',
            message: 'Start date must be before or equal to end date',
          },
          timestamp: new Date(),
        });
      }

      // Set validated dates on request object
      req.timeRange = {
        start,
        end,
        preset: preset || 'custom',
      };
    } else {
      // No time range specified, use default (last 30 days)
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      req.timeRange = {
        start,
        end: now,
        preset: 'last30days',
      };
    }

    next();
  } catch (error) {
    console.error('Error in validateTimeRange middleware:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
      timestamp: new Date(),
    });
  }
}

module.exports = {
  validateTimeRange,
};
