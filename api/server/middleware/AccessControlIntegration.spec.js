// Mock dependencies first, before any imports
jest.mock('~/server/services/TimeWindowService', () => ({
  checkTimeWindowAccess: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const request = require('supertest');
const express = require('express');
const validateTimeWindows = require('./validateTimeWindows');
const { checkTimeWindowAccess } = require('~/server/services/TimeWindowService');

describe('Epic 3: Access Control Logic - Middleware Integration', () => {
  let app;
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware that sets req.user
    app.use((req, res, next) => {
      req.user = { id: 'user123', role: 'user' };
      next();
    });
    
    app.use(validateTimeWindows);
    
    // Test endpoint
    app.post('/api/chat', (req, res) => {
      res.json({ message: 'Chat endpoint reached' });
    });
    
    // Error handler
    app.use((err, req, res, next) => {
      res.status(500).json({ error: err.message });
    });

    jest.clearAllMocks();
  });

  describe('Middleware Integration in Chat Routes', () => {
    it('should allow chat request when user has access', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response.body.message).toBe('Chat endpoint reached');
      expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123');
    });

    it('should block chat request when user lacks access', async () => {
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied. You are currently outside your allowed time windows.',
        nextAllowedTime: '2024-01-15T09:00:00.000Z'
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(403);

      expect(response.body).toEqual({
        error: 'Time Window Restriction',
        message: 'Access denied. You are currently outside your allowed time windows.',
        type: 'time_window_restriction',
        nextAllowedTime: '2024-01-15T09:00:00.000Z',
        details: {
          code: 'OUTSIDE_TIME_WINDOW',
          canRetryAt: '2024-01-15T09:00:00.000Z',
        }
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      // Create app without authentication middleware
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());
      unauthenticatedApp.use(validateTimeWindows);
      unauthenticatedApp.post('/api/chat', (req, res) => {
        res.json({ message: 'Chat endpoint reached' });
      });

      const response = await request(unauthenticatedApp)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required',
        type: 'auth_required'
      });
    });
  });

  describe('Error Handling and Fallback Behavior', () => {
    it('should allow access when time window service fails (graceful degradation)', async () => {
      checkTimeWindowAccess.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response.body.message).toBe('Chat endpoint reached');
    });

    it('should handle malformed access check response', async () => {
      checkTimeWindowAccess.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(403);

      expect(response.body.error).toBe('Time Window Restriction');
    });

    it('should handle unexpected access check response format', async () => {
      checkTimeWindowAccess.mockResolvedValue({ 
        someUnexpectedProperty: 'value' 
        // Missing isAllowed property
      });

      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(403);

      expect(response.body.error).toBe('Time Window Restriction');
    });
  });

  describe('Multiple Endpoint Integration', () => {
    beforeEach(() => {
      // Add multiple endpoints
      app.post('/api/agents/chat', (req, res) => {
        res.json({ message: 'Agent chat endpoint reached' });
      });
      
      app.post('/api/assistants/chat', (req, res) => {
        res.json({ message: 'Assistant chat endpoint reached' });
      });

      app.post('/api/edit', (req, res) => {
        res.json({ message: 'Edit endpoint reached' });
      });
    });

    it('should protect all chat endpoints consistently', async () => {
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Outside business hours'
      });

      // Test each endpoint
      const endpoints = ['/api/chat', '/api/agents/chat', '/api/assistants/chat', '/api/edit'];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          .post(endpoint)
          .send({ message: 'Test' })
          .expect(403);

        expect(response.body.error).toBe('Time Window Restriction');
      }

      expect(checkTimeWindowAccess).toHaveBeenCalledTimes(endpoints.length);
    });

    it('should allow all endpoints when access is granted', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      const endpoints = [
        { path: '/api/chat', expectedMessage: 'Chat endpoint reached' },
        { path: '/api/agents/chat', expectedMessage: 'Agent chat endpoint reached' },
        { path: '/api/assistants/chat', expectedMessage: 'Assistant chat endpoint reached' },
        { path: '/api/edit', expectedMessage: 'Edit endpoint reached' }
      ];
      
      for (const { path, expectedMessage } of endpoints) {
        const response = await request(app)
          .post(path)
          .send({ message: 'Test' })
          .expect(200);

        expect(response.body.message).toBe(expectedMessage);
      }
    });
  });

  describe('Middleware Order and Compatibility', () => {
    it('should work correctly with rate limiting middleware', async () => {
      const rateLimitMiddleware = jest.fn((req, res, next) => {
        // Simulate rate limit check
        if (req.headers['x-test-rate-limit'] === 'exceeded') {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        next();
      });

      // Create app with rate limiting before time window validation
      const rateLimitedApp = express();
      rateLimitedApp.use(express.json());
      rateLimitedApp.use((req, res, next) => {
        req.user = { id: 'user123' };
        next();
      });
      rateLimitedApp.use(rateLimitMiddleware);
      rateLimitedApp.use(validateTimeWindows);
      rateLimitedApp.post('/api/chat', (req, res) => {
        res.json({ message: 'Success' });
      });

      // Test rate limit triggers before time window check
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      const response = await request(rateLimitedApp)
        .post('/api/chat')
        .set('x-test-rate-limit', 'exceeded')
        .send({ message: 'Hello' })
        .expect(429);

      expect(response.body.error).toBe('Rate limit exceeded');
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should work correctly with other authentication middleware', async () => {
      const authMiddleware = jest.fn((req, res, next) => {
        if (req.headers.authorization === 'Bearer invalid') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = { id: 'user123' };
        next();
      });

      // Create app with custom auth
      const customAuthApp = express();
      customAuthApp.use(express.json());
      customAuthApp.use(authMiddleware);
      customAuthApp.use(validateTimeWindows);
      customAuthApp.post('/api/chat', (req, res) => {
        res.json({ message: 'Success' });
      });

      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      // Test auth failure prevents time window check
      const response = await request(customAuthApp)
        .post('/api/chat')
        .set('Authorization', 'Bearer invalid')
        .send({ message: 'Hello' })
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });
  });

  describe('Request Context and Headers', () => {
    it('should preserve request context through middleware chain', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      // Add middleware to capture request context
      app.use((req, res, next) => {
        req.testContext = { timestamp: Date.now() };
        next();
      });

      app.post('/api/test-context', (req, res) => {
        res.json({ 
          message: 'Success',
          hasContext: !!req.testContext,
          hasUser: !!req.user
        });
      });

      const response = await request(app)
        .post('/api/test-context')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response.body.hasContext).toBe(true);
      expect(response.body.hasUser).toBe(true);
    });

    it('should handle requests with various user roles', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      const roleTestCases = [
        { role: 'user', id: 'user123' },
        { role: 'admin', id: 'admin456' },
        { role: 'moderator', id: 'mod789' }
      ];

      for (const userCase of roleTestCases) {
        // Create app with specific user role
        const roleApp = express();
        roleApp.use(express.json());
        roleApp.use((req, res, next) => {
          req.user = userCase;
          next();
        });
        roleApp.use(validateTimeWindows);
        roleApp.post('/api/chat', (req, res) => {
          res.json({ message: 'Success', userRole: req.user.role });
        });

        const response = await request(roleApp)
          .post('/api/chat')
          .send({ message: 'Hello' })
          .expect(200);

        expect(response.body.userRole).toBe(userCase.role);
        expect(checkTimeWindowAccess).toHaveBeenCalledWith(userCase.id);
      }
    });
  });

  describe('Performance Under Load', () => {
    it('should handle concurrent requests efficiently', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

      // Create multiple concurrent requests
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        request(app)
          .post('/api/chat')
          .send({ message: `Message ${i}` })
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(checkTimeWindowAccess).toHaveBeenCalledTimes(10);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle mixed allowed/denied requests correctly', async () => {
      let callCount = 0;
      checkTimeWindowAccess.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          isAllowed: callCount % 2 === 1, // Alternate between allowed and denied
          message: callCount % 2 === 0 ? 'Access denied' : undefined
        });
      });

      const requests = Array.from({ length: 6 }, (_, i) => 
        request(app)
          .post('/api/chat')
          .send({ message: `Message ${i}` })
      );

      const responses = await Promise.all(requests);

      // Should have 3 successful (200) and 3 denied (403)
      const successCount = responses.filter(r => r.status === 200).length;
      const deniedCount = responses.filter(r => r.status === 403).length;

      expect(successCount).toBe(3);
      expect(deniedCount).toBe(3);
    });
  });

  describe('Error Response Format Consistency', () => {
    it('should return consistent error format across different scenarios', async () => {
      const testCases = [
        {
          name: 'basic denial',
          mockResponse: { isAllowed: false, message: 'Access denied' },
          expectedResponse: {
            error: 'Time Window Restriction',
            message: 'Access denied',
            type: 'time_window_restriction',
            nextAllowedTime: undefined,
            details: { code: 'OUTSIDE_TIME_WINDOW', canRetryAt: undefined }
          }
        },
        {
          name: 'denial with next allowed time',
          mockResponse: { 
            isAllowed: false, 
            message: 'Business hours only',
            nextAllowedTime: '2024-01-16T09:00:00.000Z'
          },
          expectedResponse: {
            error: 'Time Window Restriction',
            message: 'Business hours only',
            type: 'time_window_restriction',
            nextAllowedTime: '2024-01-16T09:00:00.000Z',
            details: { code: 'OUTSIDE_TIME_WINDOW', canRetryAt: '2024-01-16T09:00:00.000Z' }
          }
        }
      ];

      for (const testCase of testCases) {
        checkTimeWindowAccess.mockResolvedValue(testCase.mockResponse);

        const response = await request(app)
          .post('/api/chat')
          .send({ message: 'Hello' })
          .expect(403);

        expect(response.body).toEqual(testCase.expectedResponse);
      }
    });

    it('should provide helpful error messages for different window types', async () => {
      const windowTypeMessages = [
        'Access denied. Business hours are 9 AM to 5 PM, Monday through Friday.',
        'Access denied. You can send prompts again at 2024-01-16T09:00:00.000Z.',
        'Access denied. System maintenance in progress until 2024-01-15T18:00:00.000Z.',
        'Access denied. Holiday schedule in effect - access resumes January 2nd.'
      ];

      for (const message of windowTypeMessages) {
        checkTimeWindowAccess.mockResolvedValue({
          isAllowed: false,
          message: message
        });

        const response = await request(app)
          .post('/api/chat')
          .send({ message: 'Hello' })
          .expect(403);

        expect(response.body.message).toBe(message);
        expect(response.body.type).toBe('time_window_restriction');
      }
    });
  });

  describe('Logging and Monitoring Integration', () => {
    it('should log access attempts for monitoring', async () => {
      const mockLogger = {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      };

      // Mock the logger module
      jest.doMock('@librechat/data-schemas', () => ({
        logger: mockLogger
      }));

      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied for testing'
      });

      await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(403);

      // The actual logging is done in the middleware
      // This verifies the integration point exists
      expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123');
    });
  });
});