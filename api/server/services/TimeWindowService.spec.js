// Mock dependencies first, before any imports
jest.mock('~/models/Group', () => ({
  getUserGroups: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { checkTimeWindowAccess } = require('./TimeWindowService');
const { getUserGroups } = require('~/models/Group');
const { logger } = require('@librechat/data-schemas');

describe('TimeWindowService', () => {
  let RealDate;
  
  // Helper function to mock Date to a specific time
  const mockDateTo = (mockTime) => {
    global.Date = jest.fn((dateStr) => {
      if (dateStr) {
        return new RealDate(dateStr);
      }
      return new RealDate(mockTime);
    });
    global.Date.now = jest.fn(() => new RealDate(mockTime).getTime());
    global.Date.parse = RealDate.parse;
    global.Date.UTC = RealDate.UTC;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Store the real Date constructor
    RealDate = Date;
    
    // Default mock time: Monday, January 15, 2024, 10:30 AM UTC
    mockDateTo('2024-01-15T10:30:00.000Z');
  });

  afterEach(() => {
    // Restore original Date constructor
    global.Date = RealDate;
    jest.restoreAllMocks();
  });

  describe('checkTimeWindowAccess', () => {
    it('should deny access for user with no groups by default', async () => {
      getUserGroups.mockResolvedValue([]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ 
        isAllowed: false,
        message: 'Access denied. You must be assigned to a group to send prompts.'
      });
    });

    it('should allow access for user with no groups when configured', async () => {
      getUserGroups.mockResolvedValue([]);

      const result = await checkTimeWindowAccess('user123', { defaultAllowWhenNoGroups: true });

      expect(result).toEqual({ isAllowed: true });
    });

    it('should allow access for user with groups but no time windows by default', async () => {
      getUserGroups.mockResolvedValue([
        { _id: 'group1', name: 'Test Group', timeWindows: [] }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should deny access for user with groups but no time windows when configured', async () => {
      getUserGroups.mockResolvedValue([
        { _id: 'group1', name: 'Test Group', timeWindows: [] }
      ]);

      const result = await checkTimeWindowAccess('user123', { defaultAllowWhenNoTimeWindows: false });

      expect(result).toEqual({ 
        isAllowed: false,
        message: 'Access denied. You are currently outside your allowed time windows.',
        nextAllowedTime: null
      });
    });

    it('should allow access when current time is within daily window', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Work Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should deny access when current time is outside daily window', async () => {
      // Mock time to 8 AM (before work hours)
      mockDateTo('2024-01-15T08:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Work Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('Access denied');
      expect(result.nextAllowedTime).toBeTruthy();
    });

    it('should allow access when current time is within weekly window', async () => {
      // Monday 10:30 AM (already default time, no need to change)
      // mockDateTo('2024-01-15T10:30:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Weekdays Only',
          timeWindows: [{
            _id: 'window1',
            name: 'Weekday Hours',
            windowType: 'weekly',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should deny access when current day is not in weekly window', async () => {
      // Sunday 10:30 AM
      mockDateTo('2024-01-14T10:30:00.000Z'); // Sunday

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Weekdays Only',
          timeWindows: [{
            _id: 'window1',
            name: 'Weekday Hours',
            windowType: 'weekly',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('should allow access when current date is within date range window', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Holiday Access',
          timeWindows: [{
            _id: 'window1',
            name: 'Holiday Period',
            windowType: 'date_range',
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should deny access when current date is outside date range window', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Holiday Access',
          timeWindows: [{
            _id: 'window1',
            name: 'Holiday Period',
            windowType: 'date_range',
            startDate: '2024-02-01',
            endDate: '2024-02-28',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('should handle exception windows that block access', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Group with Exception',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Always Allow',
              windowType: 'daily',
              startTime: '00:00',
              endTime: '23:59',
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window2',
              name: 'Maintenance Block',
              windowType: 'exception',
              startDate: '2024-01-15',
              endDate: '2024-01-15',
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('should allow access if ANY group allows it (multiple group membership)', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Hours Only',
            windowType: 'daily',
            startTime: '20:00',
            endTime: '08:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Business Hours Group',
          timeWindows: [{
            _id: 'window2',
            name: 'Day Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should skip inactive time windows', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Group with Inactive Window',
          timeWindows: [{
            _id: 'window1',
            name: 'Inactive Window',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: false // Inactive window
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should handle midnight crossing for daily windows', async () => {
      // Test at 11 PM
      mockDateTo('2024-01-15T23:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Night Shift',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Hours',
            windowType: 'daily',
            startTime: '22:00',
            endTime: '06:00', // Crosses midnight
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
    });

    it('should calculate next allowed time correctly for daily windows', async () => {
      // Test at 8 AM (before 9 AM start)
      mockDateTo('2024-01-15T08:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Work Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should calculate next allowed time correctly for weekly windows', async () => {
      // Test on Saturday (should get Monday as next allowed time)
      mockDateTo('2024-01-13T10:00:00.000Z'); // Saturday

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Weekdays Only',
          timeWindows: [{
            _id: 'window1',
            name: 'Weekday Hours',
            windowType: 'weekly',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T09:00:00.000Z'); // Next Monday
    });

    it('should handle errors gracefully and allow access', async () => {
      const error = new Error('Database connection failed');
      getUserGroups.mockRejectedValue(error);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ isAllowed: true });
      expect(logger.error).toHaveBeenCalledWith('[TimeWindowService] Error checking time window access:', error);
    });

    it('should handle user with null groups', async () => {
      getUserGroups.mockResolvedValue(null);

      const result = await checkTimeWindowAccess('user123');

      expect(result).toEqual({ 
        isAllowed: false,
        message: 'Access denied. You must be assigned to a group to send prompts.'
      });
    });

    it('should handle windows with missing required fields gracefully', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Broken Window Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Broken Daily Window',
            windowType: 'daily',
            // Missing startTime and endTime
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false); // Should deny access for broken windows
    });

    it('should provide helpful message when no next allowed time is available', async () => {
      // Test with a date range window that's in the past
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Past Event',
          timeWindows: [{
            _id: 'window1',
            name: 'Past Holiday',
            windowType: 'date_range',
            startDate: '2023-12-01',
            endDate: '2023-12-31',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');

      expect(result.isAllowed).toBe(false);
      expect(result.message).toBe('Access denied. You are currently outside your allowed time windows.');
      expect(result.nextAllowedTime).toBeNull();
    });
  });
});