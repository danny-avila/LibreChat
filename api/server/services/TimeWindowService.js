const { getUserGroups } = require('~/models/Group');
const { logger } = require('@librechat/data-schemas');

/**
 * Check if the current time falls within any of the user's allowed time windows
 * @param {string} userId - The user ID
 * @param {Object} options - Configuration options
 * @param {boolean} options.defaultAllowWhenNoGroups - Whether to allow access when user has no groups (default: false)
 * @param {boolean} options.defaultAllowWhenNoTimeWindows - Whether to allow access when groups have no time windows (default: true)
 * @returns {Promise<{isAllowed: boolean, message?: string, nextAllowedTime?: string}>}
 */
const checkTimeWindowAccess = async (userId, options = {}) => {
  const { 
    defaultAllowWhenNoGroups = false, 
    defaultAllowWhenNoTimeWindows = true 
  } = options;

  try {
    // Get all groups the user belongs to
    const userGroups = await getUserGroups(userId);
    
    if (!userGroups || userGroups.length === 0) {
      // User doesn't belong to any groups - configurable behavior
      return { 
        isAllowed: defaultAllowWhenNoGroups,
        message: defaultAllowWhenNoGroups 
          ? undefined 
          : 'Access denied. You must be assigned to a group to send prompts.'
      };
    }

    const now = new Date();
    let hasActiveTimeWindows = false;
    let nextAllowedTime = null;

    // First, check for any active exception windows that would block access
    for (const group of userGroups) {
      if (!group.timeWindows || group.timeWindows.length === 0) {
        continue;
      }

      for (const window of group.timeWindows) {
        if (!window.isActive) continue;
        
        if (window.windowType === 'exception') {
          // Exception windows block access when the current time is within their date range
          if (isDateRangeWindowActive(window, now)) {
            return { 
              isAllowed: false, 
              message: 'Access denied. System maintenance in progress.',
              nextAllowedTime: getNextAllowedTime(window, now)?.toISOString() || null
            };
          }
        }
      }
    }

    // Check if user has any groups with unlimited access (no time windows)
    for (const group of userGroups) {
      if (!group.timeWindows || group.timeWindows.length === 0) {
        // Group with no time windows - configurable behavior
        if (defaultAllowWhenNoTimeWindows) {
          return { isAllowed: true };
        }
        // Continue checking other groups if this one doesn't allow unlimited access
      }
    }

    // Then check regular time windows for access
    for (const group of userGroups) {
      for (const window of group.timeWindows) {
        if (!window.isActive) continue;
        
        // Skip exception windows - already handled above
        if (window.windowType === 'exception') continue;

        // We have at least one active non-exception window
        hasActiveTimeWindows = true;

        const isWithinWindow = isCurrentTimeInWindow(window, now);
        if (isWithinWindow) {
          // Found at least one valid time window - access allowed
          return { isAllowed: true };
        }

        // Calculate next allowed time for this window
        const windowNextTime = getNextAllowedTime(window, now);
        if (windowNextTime && (!nextAllowedTime || windowNextTime < nextAllowedTime)) {
          nextAllowedTime = windowNextTime;
        }
      }
    }

    // If user has active time windows but none allow current access
    if (hasActiveTimeWindows) {
      const message = nextAllowedTime 
        ? `Access denied. You can send prompts again at ${nextAllowedTime.toISOString()}.`
        : 'Access denied. You are currently outside your allowed time windows.';
      
      return { 
        isAllowed: false, 
        message,
        nextAllowedTime: nextAllowedTime ? nextAllowedTime.toISOString() : null
      };
    }

    // User has groups but no active time windows
    // This means all groups have no time windows and defaultAllowWhenNoTimeWindows is false
    if (!defaultAllowWhenNoTimeWindows) {
      return { 
        isAllowed: false, 
        message: 'Access denied. You are currently outside your allowed time windows.',
        nextAllowedTime: null
      };
    }

    // Default: allow access
    return { isAllowed: true };

  } catch (error) {
    logger.error('[TimeWindowService] Error checking time window access:', error);
    // On error, allow access to prevent service disruption
    return { isAllowed: true };
  }
};

/**
 * Check if current time is within a specific time window
 * @param {Object} window - Time window configuration
 * @param {Date} now - Current date
 * @returns {boolean}
 */
const isCurrentTimeInWindow = (window, now) => {
  // For simplicity, we'll use UTC for all calculations
  // In production, you might want to handle timezones properly
  
  switch (window.windowType) {
    case 'daily':
      return isDailyWindowActive(window, now);
    case 'weekly':
      return isWeeklyWindowActive(window, now);
    case 'date_range':
      return isDateRangeWindowActive(window, now);
    case 'exception':
      // Exception windows are handled separately in the main logic
      return false;
    default:
      return false;
  }
};

/**
 * Check if current time falls within daily recurring window
 */
const isDailyWindowActive = (window, now) => {
  if (!window.startTime || !window.endTime) return false;

  const [startHour, startMin] = window.startTime.split(':').map(Number);
  const [endHour, endMin] = window.endTime.split(':').map(Number);

  const currentHour = now.getUTCHours();
  const currentMin = now.getUTCMinutes();
  const currentTime = currentHour * 60 + currentMin;
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime <= endTime) {
    // Same day (e.g., 9:00 - 17:00)
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Crosses midnight (e.g., 22:00 - 06:00)
    return currentTime >= startTime || currentTime <= endTime;
  }
};

/**
 * Check if current time falls within weekly recurring window
 */
const isWeeklyWindowActive = (window, now) => {
  if (!window.daysOfWeek || !Array.isArray(window.daysOfWeek) || window.daysOfWeek.length === 0) {
    return false;
  }

  const currentDayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday, etc.
  
  if (!window.daysOfWeek.includes(currentDayOfWeek)) {
    return false;
  }

  // If it's the right day, check the time
  return isDailyWindowActive(window, now);
};

/**
 * Check if current date falls within date range window
 */
const isDateRangeWindowActive = (window, now) => {
  if (!window.startDate || !window.endDate) return false;

  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  return currentDate >= window.startDate && currentDate <= window.endDate;
};

/**
 * Calculate the next time this window will be active
 * @param {Object} window - Time window configuration
 * @param {Date} now - Current date
 * @returns {Date|null}
 */
const getNextAllowedTime = (window, now) => {
  switch (window.windowType) {
    case 'daily':
      return getNextDailyTime(window, now);
    case 'weekly':
      return getNextWeeklyTime(window, now);
    case 'date_range':
      return getNextDateRangeTime(window, now);
    case 'exception':
      // Exception windows - find when the exception ends
      return getNextAfterExceptionTime(window, now);
    default:
      return null;
  }
};

/**
 * Get next daily window start time
 */
const getNextDailyTime = (window, now) => {
  if (!window.startTime) return null;

  const [startHour, startMin] = window.startTime.split(':').map(Number);
  const nextTime = new Date(now);
  nextTime.setUTCHours(startHour, startMin, 0, 0);

  if (nextTime > now) {
    return nextTime;
  } else {
    // Next day
    nextTime.setUTCDate(nextTime.getUTCDate() + 1);
    return nextTime;
  }
};

/**
 * Get next weekly window start time
 */
const getNextWeeklyTime = (window, now) => {
  if (!window.daysOfWeek || !Array.isArray(window.daysOfWeek) || !window.startTime) {
    return null;
  }

  const [startHour, startMin] = window.startTime.split(':').map(Number);
  const currentDay = now.getUTCDay();
  
  // Sort days of week to find the next occurrence
  const sortedDays = [...window.daysOfWeek].sort((a, b) => a - b);
  
  // Try today first
  if (sortedDays.includes(currentDay)) {
    const todayTime = new Date(now);
    todayTime.setUTCHours(startHour, startMin, 0, 0);
    if (todayTime > now) {
      return todayTime;
    }
  }
  
  // Find next day in the week
  for (let day of sortedDays) {
    if (day > currentDay) {
      const daysToAdd = day - currentDay;
      const nextTime = new Date(now);
      nextTime.setUTCDate(nextTime.getUTCDate() + daysToAdd);
      nextTime.setUTCHours(startHour, startMin, 0, 0);
      return nextTime;
    }
  }
  
  // Next week's first day
  const nextWeekDay = sortedDays[0];
  const daysToAdd = (7 - currentDay) + nextWeekDay;
  const nextTime = new Date(now);
  nextTime.setUTCDate(nextTime.getUTCDate() + daysToAdd);
  nextTime.setUTCHours(startHour, startMin, 0, 0);
  return nextTime;
};

/**
 * Get next date range window start time
 */
const getNextDateRangeTime = (window, now) => {
  if (!window.startDate) return null;

  const startDate = new Date(window.startDate + 'T00:00:00.000Z');
  if (startDate > now) {
    return startDate;
  }
  
  return null; // Date range windows don't repeat
};

/**
 * Get next time after exception window ends
 */
const getNextAfterExceptionTime = (window, now) => {
  if (!window.endDate) return null;

  const endDate = new Date(window.endDate + 'T23:59:59.999Z');
  if (endDate > now) {
    return new Date(endDate.getTime() + 60000); // Add 1 minute after end
  }
  
  return null;
};

module.exports = {
  checkTimeWindowAccess,
};