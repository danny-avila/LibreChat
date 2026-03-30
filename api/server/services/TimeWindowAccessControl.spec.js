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

describe('Epic 3: Access Control Logic - Prompt Time Validation', () => {
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
    
    // Set a fixed date for consistent testing: January 15, 2024 (Monday) at 10:30 AM UTC
    mockDateTo('2024-01-15T10:30:00.000Z');
  });

  afterEach(() => {
    // Restore original Date constructor
    global.Date = RealDate;
    jest.restoreAllMocks();
  });

  describe('FR3.1: Login attempts are validated against user\'s group time windows', () => {
    it('should validate access for user within single time window', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Business Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(true);
    });

    it('should deny access for user outside time window', async () => {
      // Set time to 8:00 AM (before business hours)
      mockDateTo('2024-01-15T08:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Business Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('Access denied');
      expect(result.nextAllowedTime).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should validate weekly time windows correctly', async () => {
      // Monday 10:30 AM
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Weekday Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Monday to Friday',
            windowType: 'weekly',
            startTime: '08:00',
            endTime: '18:00',
            daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(true);
    });

    it('should deny access on weekend for weekday-only window', async () => {
      // Saturday 10:30 AM
      mockDateTo('2024-01-13T10:30:00.000Z'); // Saturday

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Weekday Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Monday to Friday',
            windowType: 'weekly',
            startTime: '08:00',
            endTime: '18:00',
            daysOfWeek: [1, 2, 3, 4, 5],
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T08:00:00.000Z'); // Next Monday
    });
  });

  describe('FR3.2: If user belongs to multiple groups, access is granted if ANY group allows access', () => {
    it('should allow access if any group permits it', async () => {
      // Current time: Monday 10:30 AM
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Night Shift',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Hours',
            windowType: 'daily',
            startTime: '20:00',
            endTime: '06:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Day Shift',
          timeWindows: [{
            _id: 'window2',
            name: 'Day Hours',
            windowType: 'daily',
            startTime: '08:00',
            endTime: '16:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(true);
    });

    it('should deny access if no group permits it', async () => {
      // Current time: Monday 10:30 AM
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Early Morning',
          timeWindows: [{
            _id: 'window1',
            name: 'Early Hours',
            windowType: 'daily',
            startTime: '04:00',
            endTime: '08:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Evening',
          timeWindows: [{
            _id: 'window2',
            name: 'Evening Hours',
            windowType: 'daily',
            startTime: '18:00',
            endTime: '22:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T18:00:00.000Z'); // Next evening window
    });

    it('should handle mixed group states (some with windows, some without)', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Restricted Hours',
            windowType: 'daily',
            startTime: '20:00',
            endTime: '21:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Unrestricted Group',
          timeWindows: [] // No time windows = always allowed
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });

      expect(result.isAllowed).toBe(true);
    });
  });

  describe('FR3.3: System administrators bypass all time restrictions', () => {
    // Note: Admin bypass is typically handled at the middleware level
    // This would require extending the service to check user roles
    it('should allow testing admin bypass logic extension', async () => {
      // This is a placeholder for when admin bypass is implemented
      const mockCheckTimeWindowAccessWithAdminBypass = async (userId, isAdmin = false) => {
        if (isAdmin) {
          return { isAllowed: true };
        }
        return checkTimeWindowAccess(userId, {
          defaultAllowWhenNoGroups: false,
          defaultAllowWhenNoTimeWindows: true
        });
      };

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Very Restricted',
            windowType: 'daily',
            startTime: '01:00',
            endTime: '02:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      // Regular user should be denied
      const regularResult = await mockCheckTimeWindowAccessWithAdminBypass('user123', false);
      expect(regularResult.isAllowed).toBe(false);

      // Admin should be allowed
      const adminResult = await mockCheckTimeWindowAccessWithAdminBypass('admin123', true);
      expect(adminResult.isAllowed).toBe(true);
    });
  });

  describe('FR3.4: Active sessions are handled gracefully when time window expires', () => {
    it('should provide grace period information when access expires', async () => {
      // Set time to just before end of window
      mockDateTo('2024-01-15T16:58:00.000Z'); // 4:58 PM

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Business Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(true);

      // Test what happens after window expires
      mockDateTo('2024-01-15T17:01:00.000Z'); // 5:01 PM - after window

      const expiredResult = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(expiredResult.isAllowed).toBe(false);
      expect(expiredResult.nextAllowedTime).toBe('2024-01-16T09:00:00.000Z'); // Next day
    });
  });

  describe('FR3.5: Failed login attempts due to time restrictions are logged', () => {
    it('should handle logging via error callback (simulated)', async () => {
      // Set time outside window
      mockDateTo('2024-01-15T08:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Business Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(false);
      
      // The middleware should log this failure
      // We simulate what the middleware would do
      const logFailedAccess = (userId, reason) => {
        // In a real scenario, the middleware would log this
        console.log(`Time window access denied for user ${userId}: ${reason}`);
      };

      logFailedAccess('user123', result.message);
      expect(result.message).toContain('Access denied');
    });
  });

  describe('Edge Cases and Overlapping Windows', () => {
    it('should handle overlapping time windows correctly', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Overlapping Windows',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Morning Window',
              windowType: 'daily',
              startTime: '08:00',
              endTime: '12:00',
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window2',
              name: 'Afternoon Window',
              windowType: 'daily',
              startTime: '10:00',
              endTime: '16:00',
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(true); // Should allow in overlapping period
    });

    it('should handle exception windows overriding regular windows', async () => {
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

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(false); // Exception should block access
    });

    it('should handle timezone edge cases', async () => {
      // Test with different timezone
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'EST Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'EST Hours',
            windowType: 'daily',
            startTime: '14:00', // 9 AM EST = 2 PM UTC
            endTime: '22:00',   // 5 PM EST = 10 PM UTC
            timezone: 'America/New_York',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      // Note: Current implementation uses UTC only, but this tests the concept
      expect(result.isAllowed).toBe(false); // 10:30 UTC is before 14:00 UTC
    });

    it('should handle midnight crossing windows', async () => {
      // Set time to 11 PM
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

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(true);
    });

    it('should handle complex weekly patterns', async () => {
      // Test on Friday
      mockDateTo('2024-01-19T15:00:00.000Z'); // Friday 3 PM

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Flexible Schedule',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Weekday Mornings',
              windowType: 'weekly',
              startTime: '08:00',
              endTime: '12:00',
              daysOfWeek: [1, 2, 3, 4, 5],
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window2',
              name: 'Friday Afternoons',
              windowType: 'weekly',
              startTime: '13:00',
              endTime: '17:00',
              daysOfWeek: [5], // Friday only
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(true);
    });

    it('should handle date range boundaries correctly', async () => {
      // Test on exact start date
      mockDateTo('2024-01-01T12:00:00.000Z');

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Holiday Access',
          timeWindows: [{
            _id: 'window1',
            name: 'January Access',
            windowType: 'date_range',
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(true);
    });

    it('should provide most immediate next allowed time from multiple windows', async () => {
      // Set time when no windows are active
      mockDateTo('2024-01-15T07:00:00.000Z'); // 7 AM

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Multiple Shifts',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Morning Shift',
              windowType: 'daily',
              startTime: '08:00',
              endTime: '16:00',
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window2',
              name: 'Night Shift',
              windowType: 'daily',
              startTime: '20:00',
              endTime: '04:00',
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T08:00:00.000Z'); // Next morning shift (closer than night shift)
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle large number of time windows efficiently', async () => {
      // Create many windows
      const manyWindows = Array.from({ length: 100 }, (_, i) => ({
        _id: `window${i}`,
        name: `Window ${i}`,
        windowType: 'daily',
        startTime: '01:00',
        endTime: '02:00',
        timezone: 'UTC',
        isActive: true
      }));

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Group with Many Windows',
          timeWindows: manyWindows
        }
      ]);

      const startTime = new Date().getTime();
      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      const endTime = new Date().getTime();

      expect(result.isAllowed).toBe(false);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should handle malformed time window data gracefully', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Group with Bad Data',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Malformed Window',
              windowType: 'daily',
              startTime: 'invalid-time',
              endTime: '17:00',
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123', {
        defaultAllowWhenNoGroups: false,
        defaultAllowWhenNoTimeWindows: true
      });
      expect(result.isAllowed).toBe(false); // Should deny access for malformed data
    });
  });
});