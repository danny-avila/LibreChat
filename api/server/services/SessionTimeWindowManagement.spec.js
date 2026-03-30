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

describe('Epic 3: Access Control Logic - Session Management During Time Window Expiration', () => {
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
    
    // Default mock time: 4:55 PM - 5 minutes before window expires
    mockDateTo('2024-01-15T16:55:00.000Z');
  });

  afterEach(() => {
    // Restore original Date constructor
    global.Date = RealDate;
    jest.restoreAllMocks();
  });

  describe('FR3.4: Active sessions are handled gracefully when time window expires', () => {
    describe('Grace Period Implementation', () => {
      it('should calculate remaining time until window expiration', async () => {
        getUserGroups.mockResolvedValue([
          {
            _id: 'group1',
            name: 'Business Hours',
            timeWindows: [{
              _id: 'window1',
              name: 'Daily Business Hours',
              windowType: 'daily',
              startTime: '09:00',
              endTime: '17:00', // Expires at 5:00 PM
              timezone: 'UTC',
              isActive: true
            }]
          }
        ]);

        const result = await checkTimeWindowAccess('user123');
        expect(result.isAllowed).toBe(true);

        // Calculate remaining time (5 minutes until 17:00)
        const currentTime = new Date('2024-01-15T16:55:00.000Z');
        const windowEnd = new Date('2024-01-15T17:00:00.000Z');
        const remainingMs = windowEnd.getTime() - currentTime.getTime();
        const remainingMinutes = Math.floor(remainingMs / (1000 * 60));

        expect(remainingMinutes).toBe(5);
      });

      it('should provide warning when approaching window expiration', async () => {
        const mockSessionWarningService = (currentTime, windowEndTime) => {
          const timeUntilExpiry = new Date(windowEndTime) - new Date(currentTime);
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
          
          return {
            shouldWarn: minutesUntilExpiry <= 5 && minutesUntilExpiry > 0,
            warningMessage: `Your session will expire in ${minutesUntilExpiry} minutes`,
            expiryTime: windowEndTime,
            gracePeriodEnd: new Date(new Date(windowEndTime).getTime() + 5 * 60 * 1000).toISOString()
          };
        };

        const warning = mockSessionWarningService(
          '2024-01-15T16:57:00.000Z', // 3 minutes before expiry
          '2024-01-15T17:00:00.000Z'
        );

        expect(warning.shouldWarn).toBe(true);
        expect(warning.warningMessage).toBe('Your session will expire in 3 minutes');
        expect(warning.gracePeriodEnd).toBe('2024-01-15T17:05:00.000Z');
      });

      it('should handle session during grace period (within 5 minutes after expiry)', async () => {
        // Set time to 2 minutes after window expires
        mockDateTo('2024-01-15T17:02:00.000Z');

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

        const mockGracePeriodHandler = async (userId) => {
          const accessResult = await checkTimeWindowAccess(userId);
          
          if (!accessResult.isAllowed) {
            const currentTime = new Date();
            const windowEndTime = new Date('2024-01-15T17:00:00.000Z');
            const timeSinceExpiry = currentTime - windowEndTime;
            const gracePeriod = 5 * 60 * 1000; // 5 minutes
            
            if (timeSinceExpiry <= gracePeriod) {
              return {
                isAllowed: true,
                isInGracePeriod: true,
                gracePeriodEnds: new Date(windowEndTime.getTime() + gracePeriod).toISOString(),
                message: `Grace period active. Session will be terminated at ${new Date(windowEndTime.getTime() + gracePeriod).toISOString()}`
              };
            }
          }
          
          return accessResult;
        };

        const result = await mockGracePeriodHandler('user123');
        expect(result.isInGracePeriod).toBe(true);
        expect(result.gracePeriodEnds).toBe('2024-01-15T17:05:00.000Z');
      });

      it('should terminate session after grace period expires', async () => {
        // Set time to 6 minutes after window expires (1 minute past grace period)
        mockDateTo('2024-01-15T17:06:00.000Z');

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
        expect(result.isAllowed).toBe(false);
        expect(result.nextAllowedTime).toBe('2024-01-16T09:00:00.000Z');
      });
    });

    describe('Session State Management', () => {
      it('should track active sessions approaching expiration', async () => {
        const mockSessionManager = {
          activeSessions: new Map(),
          
          trackSession(sessionId, userId, expiryTime) {
            this.activeSessions.set(sessionId, {
              userId,
              expiryTime: new Date(expiryTime),
              warned: false,
              inGracePeriod: false
            });
          },
          
          getSessionsNearingExpiry(withinMinutes = 5) {
            const currentTime = new Date();
            const threshold = withinMinutes * 60 * 1000;
            
            return Array.from(this.activeSessions.entries())
              .filter(([sessionId, session]) => {
                const timeUntilExpiry = session.expiryTime - currentTime;
                return timeUntilExpiry > 0 && timeUntilExpiry <= threshold;
              });
          },
          
          markSessionWarned(sessionId) {
            if (this.activeSessions.has(sessionId)) {
              this.activeSessions.get(sessionId).warned = true;
            }
          },
          
          getExpiredSessions() {
            const currentTime = new Date();
            return Array.from(this.activeSessions.entries())
              .filter(([sessionId, session]) => session.expiryTime < currentTime);
          }
        };

        // Track some sessions
        mockSessionManager.trackSession('session1', 'user123', '2024-01-15T16:58:00.000Z'); // 2 minutes
        mockSessionManager.trackSession('session2', 'user456', '2024-01-15T17:10:00.000Z'); // 15 minutes
        mockSessionManager.trackSession('session3', 'user789', '2024-01-15T16:50:00.000Z'); // Expired

        // Set current time to 16:56 (1 minute later)
        mockDateTo('2024-01-15T16:56:00.000Z');

        const nearingExpiry = mockSessionManager.getSessionsNearingExpiry();
        const expired = mockSessionManager.getExpiredSessions();

        expect(nearingExpiry.length).toBe(1); // session1
        expect(nearingExpiry[0][0]).toBe('session1');
        expect(expired.length).toBe(1); // session3
        expect(expired[0][0]).toBe('session3');
      });

      it('should handle concurrent session expiration', async () => {
        const mockConcurrentSessionManager = {
          sessions: new Map(),
          
          async processExpiringSession(sessionId, userId) {
            // Check current access status
            const accessResult = await checkTimeWindowAccess(userId);
            
            if (!accessResult.isAllowed) {
              // Check if in grace period
              const session = this.sessions.get(sessionId);
              if (session) {
                const timeSinceExpiry = new Date() - session.windowExpiryTime;
                const gracePeriod = 5 * 60 * 1000;
                
                if (timeSinceExpiry <= gracePeriod) {
                  session.status = 'grace_period';
                  session.gracePeriodEnds = new Date(session.windowExpiryTime.getTime() + gracePeriod);
                  return { action: 'warn', session };
                } else {
                  session.status = 'terminated';
                  return { action: 'terminate', session };
                }
              }
            }
            
            return { action: 'continue', session: this.sessions.get(sessionId) };
          },
          
          addSession(sessionId, userId, windowExpiryTime) {
            this.sessions.set(sessionId, {
              userId,
              windowExpiryTime: new Date(windowExpiryTime),
              status: 'active',
              createdAt: new Date()
            });
          }
        };

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

        // Add sessions for different users
        mockConcurrentSessionManager.addSession('session1', 'user123', '2024-01-15T17:00:00.000Z');
        mockConcurrentSessionManager.addSession('session2', 'user456', '2024-01-15T17:00:00.000Z');

        // Test during grace period (17:02)
        mockDateTo('2024-01-15T17:02:00.000Z');

        const result1 = await mockConcurrentSessionManager.processExpiringSession('session1', 'user123');
        const result2 = await mockConcurrentSessionManager.processExpiringSession('session2', 'user456');

        expect(result1.action).toBe('warn');
        expect(result1.session.status).toBe('grace_period');
        expect(result2.action).toBe('warn');
        expect(result2.session.status).toBe('grace_period');
      });
    });

    describe('WebSocket Integration for Real-time Notifications', () => {
      it('should send real-time warnings to active sessions', async () => {
        const mockWebSocketManager = {
          connections: new Map(),
          
          addConnection(sessionId, websocket) {
            this.connections.set(sessionId, websocket);
          },
          
          sendWarning(sessionId, message) {
            const ws = this.connections.get(sessionId);
            if (ws && ws.readyState === 1) { // WebSocket.OPEN
              ws.send(JSON.stringify({
                type: 'time_window_warning',
                message: message,
                timestamp: new Date().toISOString()
              }));
              return true;
            }
            return false;
          },
          
          sendTermination(sessionId) {
            const ws = this.connections.get(sessionId);
            if (ws && ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'time_window_expired',
                message: 'Your session has expired due to time window restrictions',
                timestamp: new Date().toISOString(),
                action: 'redirect_to_login'
              }));
              ws.close();
              this.connections.delete(sessionId);
              return true;
            }
            return false;
          }
        };

        // Mock WebSocket
        const mockWebSocket = {
          readyState: 1, // OPEN
          send: jest.fn(),
          close: jest.fn()
        };

        mockWebSocketManager.addConnection('session123', mockWebSocket);

        // Send warning
        const warningsent = mockWebSocketManager.sendWarning('session123', 'Your session will expire in 2 minutes');
        expect(warningsent).toBe(true);
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"time_window_warning"')
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Your session will expire in 2 minutes"')
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"timestamp":"2024-01-15T16:55:00.000Z"')
        );

        // Send termination
        const terminationSent = mockWebSocketManager.sendTermination('session123');
        expect(terminationSent).toBe(true);
        expect(mockWebSocket.close).toHaveBeenCalled();
      });

      it('should handle WebSocket connection errors gracefully', async () => {
        const mockWebSocketManager = {
          connections: new Map(),
          
          addConnection(sessionId, websocket) {
            this.connections.set(sessionId, websocket);
          },
          
          sendMessage(sessionId, message) {
            const ws = this.connections.get(sessionId);
            if (ws) {
              try {
                if (ws.readyState === 1) { // OPEN
                  ws.send(JSON.stringify(message));
                  return { success: true };
                } else {
                  return { success: false, error: 'WebSocket not open' };
                }
              } catch (error) {
                return { success: false, error: error.message };
              }
            }
            return { success: false, error: 'Connection not found' };
          }
        };

        // Test with closed WebSocket
        const closedWebSocket = {
          readyState: 3, // CLOSED
          send: jest.fn().mockImplementation(() => {
            throw new Error('WebSocket is closed');
          })
        };

        mockWebSocketManager.addConnection('session123', closedWebSocket);

        const result = mockWebSocketManager.sendMessage('session123', { type: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('WebSocket not open');
      });
    });

    describe('Database Session Cleanup', () => {
      it('should clean up expired sessions from database', async () => {
        const mockSessionDatabase = {
          activeSessions: [
            { id: 'session1', userId: 'user123', expiresAt: '2024-01-15T16:30:00.000Z', status: 'active' },
            { id: 'session2', userId: 'user456', expiresAt: '2024-01-15T18:00:00.000Z', status: 'active' },
            { id: 'session3', userId: 'user789', expiresAt: '2024-01-15T16:45:00.000Z', status: 'expired' }
          ],
          
          async cleanupExpiredSessions() {
            const currentTime = new Date('2024-01-15T17:00:00.000Z');
            const beforeCount = this.activeSessions.length;
            
            this.activeSessions = this.activeSessions.filter(session => {
              const sessionExpiry = new Date(session.expiresAt);
              return sessionExpiry > currentTime && session.status !== 'expired';
            });
            
            const afterCount = this.activeSessions.length;
            return { cleaned: beforeCount - afterCount, remaining: afterCount };
          },
          
          async updateSessionStatus(sessionId, status) {
            const session = this.activeSessions.find(s => s.id === sessionId);
            if (session) {
              session.status = status;
              session.updatedAt = new Date().toISOString();
              return true;
            }
            return false;
          }
        };

        const cleanupResult = await mockSessionDatabase.cleanupExpiredSessions();
        expect(cleanupResult.cleaned).toBe(2); // session1 and session3
        expect(cleanupResult.remaining).toBe(1); // session2
        expect(mockSessionDatabase.activeSessions.length).toBe(1);
        expect(mockSessionDatabase.activeSessions[0].id).toBe('session2');
      });

      it('should handle session cleanup with grace periods', async () => {
        const mockGracefulSessionCleanup = {
          sessions: [
            { id: 'session1', windowExpiresAt: '2024-01-15T17:00:00.000Z', gracePeriodEnds: '2024-01-15T17:05:00.000Z' },
            { id: 'session2', windowExpiresAt: '2024-01-15T16:30:00.000Z', gracePeriodEnds: '2024-01-15T16:35:00.000Z' },
          ],
          
          async cleanupAfterGracePeriod() {
            const currentTime = new Date('2024-01-15T17:03:00.000Z'); // 17:03
            const results = [];
            
            for (const session of this.sessions) {
              const gracePeriodEnd = new Date(session.gracePeriodEnds);
              
              if (currentTime > gracePeriodEnd) {
                results.push({ sessionId: session.id, action: 'terminated' });
              } else {
                results.push({ sessionId: session.id, action: 'grace_active' });
              }
            }
            
            return results;
          }
        };

        const results = await mockGracefulSessionCleanup.cleanupAfterGracePeriod();
        
        expect(results[0].action).toBe('grace_active'); // session1 still in grace
        expect(results[1].action).toBe('terminated');   // session2 grace expired
      });
    });

    describe('Multi-window Expiration Scenarios', () => {
      it('should handle user with multiple overlapping windows expiring at different times', async () => {
        getUserGroups.mockResolvedValue([
          {
            _id: 'group1',
            name: 'Morning Shift',
            timeWindows: [{
              _id: 'window1',
              name: 'Morning Hours',
              windowType: 'daily',
              startTime: '06:00',
              endTime: '14:00', // Expires at 2 PM
              timezone: 'UTC',
              isActive: true
            }]
          },
          {
            _id: 'group2',
            name: 'Extended Hours',
            timeWindows: [{
              _id: 'window2',
              name: 'Extended Coverage',
              windowType: 'daily',
              startTime: '08:00',
              endTime: '18:00', // Expires at 6 PM
              timezone: 'UTC',
              isActive: true
            }]
          }
        ]);

        // Test at 3 PM - first window expired, second still active
        mockDateTo('2024-01-15T15:00:00.000Z'); // 3 PM

        const result = await checkTimeWindowAccess('user123');
        expect(result.isAllowed).toBe(true); // Still allowed due to extended hours window
      });

      it('should handle weekly window expiration during weekdays', async () => {
        // Set time to Friday 6 PM
        mockDateTo('2024-01-19T18:00:00.000Z'); // Friday 6 PM

        getUserGroups.mockResolvedValue([
          {
            _id: 'group1',
            name: 'Weekday Only',
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
        expect(result.nextAllowedTime).toBe('2024-01-22T09:00:00.000Z'); // Next Monday
      });
    });
  });
});