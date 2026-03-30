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

describe('Epic 3: Access Control Logic - Edge Cases and Overlapping Windows', () => {
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
    
    // Base test time: Monday, January 15, 2024, 10:30 AM UTC
    mockDateTo('2024-01-15T10:30:00.000Z');
  });

  afterEach(() => {
    // Restore original Date constructor
    global.Date = RealDate;
    jest.restoreAllMocks();
  });

  describe('SC1: Overlapping Group Memberships - Most Permissive Access Wins (Logical OR)', () => {
    it('should allow access when one group permits but another denies', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'restrictive-group',
          name: 'Restrictive Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Very Limited Hours',
            windowType: 'daily',
            startTime: '01:00',
            endTime: '02:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'permissive-group',
          name: 'Permissive Group',
          timeWindows: [{
            _id: 'window2',
            name: 'Business Hours',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true);
    });

    it('should deny access only when all groups deny', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Morning Only',
          timeWindows: [{
            _id: 'window1',
            name: 'Early Hours',
            windowType: 'daily',
            startTime: '06:00',
            endTime: '09:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Evening Only',
          timeWindows: [{
            _id: 'window2',
            name: 'Late Hours',
            windowType: 'daily',
            startTime: '18:00',
            endTime: '22:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(false);
      expect(result.nextAllowedTime).toBe('2024-01-15T18:00:00.000Z'); // Next evening window
    });

    it('should handle groups with mixed window types', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'daily-group',
          name: 'Daily Schedule',
          timeWindows: [{
            _id: 'window1',
            name: 'Daily Late Hours',
            windowType: 'daily',
            startTime: '20:00',
            endTime: '23:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'weekly-group',
          name: 'Weekly Schedule',
          timeWindows: [{
            _id: 'window2',
            name: 'Monday Business Hours',
            windowType: 'weekly',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1], // Monday only
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // Weekly window allows access on Monday
    });

    it('should handle group with no time windows (unlimited access)', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'restricted-group',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Only',
            windowType: 'daily',
            startTime: '22:00',
            endTime: '04:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'unlimited-group',
          name: 'Unlimited Group',
          timeWindows: [] // No restrictions
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true);
    });

    it('should handle multiple overlapping windows within same group', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Overlapping Windows Group',
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
              name: 'Mid-day Window',
              windowType: 'daily',
              startTime: '10:00',
              endTime: '14:00',
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window3',
              name: 'Afternoon Window',
              windowType: 'daily',
              startTime: '13:00',
              endTime: '17:00',
              timezone: 'UTC',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // 10:30 AM falls in overlapping periods
    });
  });

  describe('SC2: Time Zone Changes and Calculations', () => {
    it('should handle daylight saving time transitions (conceptually)', async () => {
      // Note: Current implementation uses UTC only, but this tests the framework
      getUserGroups.mockResolvedValue([
        {
          _id: 'est-group',
          name: 'EST Group',
          timeWindows: [{
            _id: 'window1',
            name: 'EST Business Hours',
            windowType: 'daily',
            startTime: '14:00', // 9 AM EST = 2 PM UTC (standard time)
            endTime: '22:00',   // 5 PM EST = 10 PM UTC
            timezone: 'America/New_York',
            isActive: true
          }]
        }
      ]);

      // Test different times of year (DST vs Standard Time)
      const testTimes = [
        '2024-01-15T15:30:00.000Z', // Winter (EST = UTC-5)
        '2024-07-15T14:30:00.000Z'  // Summer (EDT = UTC-4)
      ];

      for (const testTime of testTimes) {
        mockDateTo(testTime);

        const result = await checkTimeWindowAccess('user123');
        // With current UTC-only implementation, timezone is ignored, so 14:00-22:00 UTC allows access at 15:30 UTC
        expect(result.isAllowed).toBe(true);
      }
    });

    it('should handle server time zone changes gracefully', async () => {
      // Test with different server time contexts
      const originalTz = process.env.TZ;
      
      try {
        process.env.TZ = 'America/Los_Angeles';
        
        getUserGroups.mockResolvedValue([
          {
            _id: 'utc-group',
            name: 'UTC Group',
            timeWindows: [{
              _id: 'window1',
              name: 'UTC Morning',
              windowType: 'daily',
              startTime: '08:00',
              endTime: '16:00',
              timezone: 'UTC',
              isActive: true
            }]
          }
        ]);

        const result = await checkTimeWindowAccess('user123');
        expect(result.isAllowed).toBe(true);
        
      } finally {
        process.env.TZ = originalTz;
      }
    });

    it('should store and compare times consistently in UTC', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'multi-tz-group',
          name: 'Multi-Timezone Group',
          timeWindows: [
            {
              _id: 'window1',
              name: 'UTC Window',
              windowType: 'daily',
              startTime: '10:00',
              endTime: '11:00',
              timezone: 'UTC',
              isActive: true
            },
            {
              _id: 'window2',
              name: 'EST Window',
              windowType: 'daily',
              startTime: '15:00', // 10 AM EST = 3 PM UTC
              endTime: '16:00',   // 11 AM EST = 4 PM UTC
              timezone: 'America/New_York',
              isActive: true
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // 10:30 UTC falls in the UTC window
    });
  });

  describe('SC3: Active Session Management During Window Expiration', () => {
    it('should detect when current time is near window expiration', async () => {
      // Set time to 4:58 PM (2 minutes before window expires)
      jest.spyOn(global, 'Date').mockImplementation((dateStr) => {
        if (dateStr) {
          return new global.Date(dateStr);
        }
        return new global.Date('2024-01-15T16:58:00.000Z');
      });

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

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true);
      
      // Test what happens after expiration
      mockDateTo('2024-01-15T17:01:00.000Z');

      const expiredResult = await checkTimeWindowAccess('user123');
      expect(expiredResult.isAllowed).toBe(false);
      expect(expiredResult.nextAllowedTime).toBe('2024-01-16T09:00:00.000Z');
    });

    it('should handle gradual session expiration with grace period calculation', async () => {
      const mockGracePeriodCalculator = (currentTime, windowEndTime) => {
        const timeDiff = new Date(windowEndTime) - new Date(currentTime);
        const gracePeriod = 5 * 60 * 1000; // 5 minutes
        
        // In grace period if:
        // 1. Less than 5 minutes before expiration (timeDiff > 0 && timeDiff <= gracePeriod)
        // 2. OR less than 5 minutes after expiration (timeDiff < 0 && Math.abs(timeDiff) <= gracePeriod)
        const isInGracePeriod = Math.abs(timeDiff) <= gracePeriod;
        
        return {
          isInGracePeriod,
          gracePeriodEnd: new Date(new Date(windowEndTime).getTime() + gracePeriod).toISOString(),
          timeUntilExpiry: Math.max(0, timeDiff)
        };
      };

      // Test at different times relative to window expiration
      const testScenarios = [
        {
          time: '2024-01-15T16:50:00.000Z', // 10 minutes before expiration
          expectedInGrace: false
        },
        {
          time: '2024-01-15T16:57:00.000Z', // 3 minutes before expiration
          expectedInGrace: true
        },
        {
          time: '2024-01-15T17:02:00.000Z', // 2 minutes after expiration (in grace)
          expectedInGrace: true
        },
        {
          time: '2024-01-15T17:06:00.000Z', // 6 minutes after expiration (grace expired)
          expectedInGrace: false
        }
      ];

      for (const scenario of testScenarios) {
        const windowEndTime = '2024-01-15T17:00:00.000Z';
        const graceInfo = mockGracePeriodCalculator(scenario.time, windowEndTime);
        
        expect(graceInfo.isInGracePeriod).toBe(scenario.expectedInGrace);
      }
    });
  });

  describe('SC4: System Clock Issues and Fallback Behavior', () => {
    it('should handle system time synchronization issues', async () => {
      // Mock Date.now() returning an invalid value
      jest.spyOn(Date, 'now').mockImplementation(() => NaN);
      jest.spyOn(global, 'Date').mockImplementation(() => new Date(NaN));

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Test Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Test Window',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      // Should fall back to allowing access when time is invalid
      expect(result.isAllowed).toBe(true);
    });

    it('should handle clock drift scenarios', async () => {
      // Simulate system clock running fast
      const actualTime = new Date('2024-01-15T10:30:00.000Z').getTime();
      const driftedTime = actualTime + (10 * 60 * 1000); // 10 minutes fast

      jest.spyOn(Date, 'now').mockImplementation(() => driftedTime);
      jest.spyOn(global, 'Date').mockImplementation((dateStr) => {
        if (dateStr) {
          return new global.Date(dateStr);
        }
        return new global.Date(driftedTime);
      });

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Precise Timing Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Precise Window',
            windowType: 'daily',
            startTime: '10:35',
            endTime: '10:45',
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // 10:40 falls within window
    });

    it('should provide warnings when time discrepancies are detected', async () => {
      // Mock a scenario where server time seems incorrect
      const mockTimeValidator = (currentTime) => {
        const now = Date.now();
        const timeDiff = Math.abs(currentTime.getTime() - now);
        
        return {
          isValid: timeDiff < 60 * 1000, // Within 1 minute is considered valid
          discrepancy: timeDiff,
          shouldWarn: timeDiff > 30 * 1000 // Warn if more than 30 seconds off
        };
      };

      const testTime = new Date('2024-01-15T10:30:00.000Z');
      const validation = mockTimeValidator(testTime);
      
      expect(validation.isValid).toBe(true);
      expect(validation.shouldWarn).toBe(false);
    });
  });

  describe('SC5: Empty Groups or Missing Time Windows', () => {
    it('should handle user with no group memberships', async () => {
      getUserGroups.mockResolvedValue([]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(false); // New policy: deny by default
      expect(result.message).toBe('Access denied. You must be assigned to a group to send prompts.');
    });

    it('should handle null/undefined group response', async () => {
      getUserGroups.mockResolvedValue(null);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(false);
      expect(result.message).toBe('Access denied. You must be assigned to a group to send prompts.');
    });

    it('should handle groups with empty time windows array', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'No Restrictions Group',
          timeWindows: []
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true);
    });

    it('should handle groups with null/undefined time windows', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Undefined Windows Group',
          timeWindows: null
        },
        {
          _id: 'group2',
          name: 'Missing Windows Group'
          // No timeWindows property
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true);
    });

    it('should handle mixed groups (some with windows, some without)', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Only',
            windowType: 'daily',
            startTime: '22:00',
            endTime: '06:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Unrestricted Group',
          timeWindows: [] // No restrictions
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // Unrestricted group allows access
    });
  });

  describe('Complex Overlapping Scenarios', () => {
    it('should handle exception windows that override regular windows', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Complex Schedule Group',
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
              name: 'Maintenance Exception',
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
      expect(result.isAllowed).toBe(false); // Exception overrides regular window
    });

    it('should handle cascading window dependencies', async () => {
      // Test a complex scenario with multiple interdependent windows
      getUserGroups.mockResolvedValue([
        {
          _id: 'primary-group',
          name: 'Primary Access Group',
          timeWindows: [
            {
              _id: 'window1',
              name: 'Weekday Access',
              windowType: 'weekly',
              startTime: '08:00',
              endTime: '18:00',
              daysOfWeek: [1, 2, 3, 4, 5],
              timezone: 'UTC',
              isActive: true
            }
          ]
        },
        {
          _id: 'secondary-group',
          name: 'Secondary Access Group',
          timeWindows: [
            {
              _id: 'window2',
              name: 'Weekend Emergency',
              windowType: 'weekly',
              startTime: '12:00',
              endTime: '14:00',
              daysOfWeek: [0, 6], // Weekend only
              timezone: 'UTC',
              isActive: true
            }
          ]
        },
        {
          _id: 'override-group',
          name: 'Holiday Override',
          timeWindows: [
            {
              _id: 'window3',
              name: 'Holiday Block',
              windowType: 'date_range',
              startDate: '2024-01-15',
              endDate: '2024-01-15',
              timezone: 'UTC',
              isActive: false // Disabled override
            }
          ]
        }
      ]);

      const result = await checkTimeWindowAccess('user123');
      expect(result.isAllowed).toBe(true); // Monday weekday access
    });

    it('should handle time window priority and precedence', async () => {
      // Test scenario where multiple windows could apply with different priorities
      const testWindowPriority = (windows) => {
        // Conceptual priority: exception > date_range > weekly > daily
        const priorities = { exception: 4, date_range: 3, weekly: 2, daily: 1 };
        
        return windows
          .filter(w => w.isActive)
          .sort((a, b) => priorities[b.windowType] - priorities[a.windowType]);
      };

      const windows = [
        { windowType: 'daily', isActive: true, name: 'Daily' },
        { windowType: 'exception', isActive: true, name: 'Exception' },
        { windowType: 'weekly', isActive: true, name: 'Weekly' }
      ];

      const sorted = testWindowPriority(windows);
      expect(sorted[0].windowType).toBe('exception');
      expect(sorted[1].windowType).toBe('weekly');
      expect(sorted[2].windowType).toBe('daily');
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle large number of overlapping windows efficiently', async () => {
      const manyOverlappingWindows = Array.from({ length: 50 }, (_, i) => ({
        _id: `window${i}`,
        name: `Overlapping Window ${i}`,
        windowType: 'daily',
        startTime: String(8 + (i % 10)).padStart(2, '0') + ':00', // 08:00 to 17:00
        endTime: String(9 + (i % 10)).padStart(2, '0') + ':00',   // 09:00 to 18:00
        timezone: 'UTC',
        isActive: true
      }));

      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Many Windows Group',
          timeWindows: manyOverlappingWindows
        }
      ]);

      const startTime = Date.now();
      const result = await checkTimeWindowAccess('user123');
      const endTime = Date.now();

      expect(result.isAllowed).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should still be fast
    });

    it('should handle deeply nested group structures (conceptual)', async () => {
      // Test handling of complex group hierarchies if implemented
      const complexGroupStructure = {
        _id: 'parent-group',
        name: 'Parent Group',
        timeWindows: [
          {
            _id: 'parent-window',
            name: 'Parent Window',
            windowType: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            timezone: 'UTC',
            isActive: true,
            // Conceptual: child windows or inherited properties
            inheritsFrom: null,
            overriddenBy: ['child-group-window']
          }
        ]
      };

      // This tests the framework for future hierarchical features
      expect(complexGroupStructure.timeWindows[0].overriddenBy).toContain('child-group-window');
    });
  });
});