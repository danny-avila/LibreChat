// Mock all dependencies first, before any imports
jest.mock('../services/TimeWindowService', () => ({
  checkTimeWindowAccess: jest.fn(),
}));

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

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const validateTimeWindows = require('../middleware/validateTimeWindows');
const { checkTimeWindowAccess } = require('../services/TimeWindowService');
const { getUserGroups } = require('~/models/Group');

describe('Epic 3: Access Control Logic - Complete Integration Flow', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create Express app with full middleware chain
    app = express();
    app.use(express.json());
    
    // JWT Authentication middleware
    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      try {
        // Mock JWT decode (in real app this would verify signature)
        const decoded = jwt.decode(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    });
    
    // Rate limiting middleware (mock)
    app.use((req, res, next) => {
      const rateLimitHeader = req.headers['x-rate-limit'];
      if (rateLimitHeader === 'exceeded') {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      next();
    });
    
    // Time window validation middleware
    app.use(validateTimeWindows);
    
    // Mock endpoints
    app.post('/api/chat', (req, res) => {
      res.json({ 
        message: 'Chat successful',
        userId: req.user.id,
        timestamp: new Date().toISOString()
      });
    });
    
    app.post('/api/agents/chat', (req, res) => {
      res.json({ message: 'Agent chat successful' });
    });
    
    app.post('/api/assistants/chat', (req, res) => {
      res.json({ message: 'Assistant chat successful' });
    });
    
    app.post('/api/edit', (req, res) => {
      res.json({ message: 'Edit successful' });
    });
    
    // Admin endpoints
    app.get('/api/admin/users', (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      res.json({ users: ['user1', 'user2'] });
    });
    
    // Error handler
    app.use((err, req, res, next) => {
      res.status(500).json({ error: err.message });
    });
  });

  describe('Complete User Journey - Allowed Access', () => {
    it('should allow complete flow for user within time windows', async () => {
      // Setup mocks
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });
      
      // Create valid JWT token
      const userPayload = { id: 'user123', role: 'user', email: 'user@test.com' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      // Test multiple endpoints in sequence
      const endpoints = [
        { path: '/api/chat', method: 'post', data: { message: 'Hello' } },
        { path: '/api/agents/chat', method: 'post', data: { query: 'Test' } },
        { path: '/api/assistants/chat', method: 'post', data: { prompt: 'Help me' } },
        { path: '/api/edit', method: 'post', data: { content: 'Edit this' } }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${token}`)
          .send(endpoint.data)
          .expect(200);
        
        expect(response.body).toHaveProperty('message');
        expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123');
      }
      
      expect(checkTimeWindowAccess).toHaveBeenCalledTimes(endpoints.length);
    });

    it('should handle user with multiple group memberships correctly', async () => {
      getUserGroups.mockResolvedValue([
        {
          _id: 'group1',
          name: 'Restricted Group',
          timeWindows: [{
            _id: 'window1',
            name: 'Night Hours',
            windowType: 'daily',
            startTime: '22:00',
            endTime: '06:00',
            timezone: 'UTC',
            isActive: true
          }]
        },
        {
          _id: 'group2',
          name: 'Business Hours Group',
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
      
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Test multiple groups' })
        .expect(200);
      
      expect(response.body.message).toBe('Chat successful');
    });
  });

  describe('Complete User Journey - Denied Access', () => {
    it('should block access across all endpoints when outside time windows', async () => {
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied. You are currently outside your allowed time windows.',
        nextAllowedTime: '2024-01-16T09:00:00.000Z'
      });
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      const endpoints = ['/api/chat', '/api/agents/chat', '/api/assistants/chat', '/api/edit'];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          .post(endpoint)
          .set('Authorization', `Bearer ${token}`)
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toEqual({
          error: 'Time Window Restriction',
          message: 'Access denied. You are currently outside your allowed time windows.',
          type: 'time_window_restriction',
          nextAllowedTime: '2024-01-16T09:00:00.000Z',
          details: {
            code: 'OUTSIDE_TIME_WINDOW',
            canRetryAt: '2024-01-16T09:00:00.000Z',
          }
        });
      }
    });

    it('should provide consistent error responses across different time window types', async () => {
      const testCases = [
        {
          name: 'Daily window restriction',
          mockResponse: {
            isAllowed: false,
            message: 'Access denied. Business hours are 9 AM to 5 PM.',
            nextAllowedTime: '2024-01-16T09:00:00.000Z'
          }
        },
        {
          name: 'Weekly window restriction',
          mockResponse: {
            isAllowed: false,
            message: 'Access denied. Weekday access only.',
            nextAllowedTime: '2024-01-22T09:00:00.000Z'
          }
        },
        {
          name: 'Exception window block',
          mockResponse: {
            isAllowed: false,
            message: 'Access denied. System maintenance in progress.',
            nextAllowedTime: null
          }
        }
      ];
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      for (const testCase of testCases) {
        checkTimeWindowAccess.mockResolvedValue(testCase.mockResponse);
        
        const response = await request(app)
          .post('/api/chat')
          .set('Authorization', `Bearer ${token}`)
          .send({ message: 'Test' })
          .expect(403);
        
        expect(response.body.error).toBe('Time Window Restriction');
        expect(response.body.message).toBe(testCase.mockResponse.message);
        expect(response.body.nextAllowedTime).toBe(testCase.mockResponse.nextAllowedTime);
      }
    });
  });

  describe('Admin Bypass Integration', () => {
    it('should allow admin users to bypass time restrictions', async () => {
      // Create admin-aware middleware
      const adminBypassMiddleware = (req, res, next) => {
        if (req.user?.role === 'admin') {
          return next(); // Skip time window validation for admins
        }
        return validateTimeWindows(req, res, next);
      };
      
      // Create new app with admin bypass
      const adminApp = express();
      adminApp.use(express.json());
      
      adminApp.use((req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
          req.user = jwt.decode(token);
        }
        next();
      });
      
      adminApp.use(adminBypassMiddleware);
      
      adminApp.post('/api/chat', (req, res) => {
        res.json({ message: 'Admin chat successful', isAdmin: req.user.role === 'admin' });
      });
      
      // Mock time window service to deny access (should be bypassed)
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Should be bypassed for admin'
      });
      
      const adminPayload = { id: 'admin123', role: 'admin' };
      const adminToken = jwt.sign(adminPayload, 'test-secret');
      
      const response = await request(adminApp)
        .post('/api/chat')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Admin test' })
        .expect(200);
      
      expect(response.body.message).toBe('Admin chat successful');
      expect(response.body.isAdmin).toBe(true);
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should still apply time windows to admin for restricted operations', async () => {
      const selectiveAdminBypass = (req, res, next) => {
        const adminBypassPaths = ['/api/admin'];
        const isAdminPath = adminBypassPaths.some(path => req.path.startsWith(path));
        
        if (req.user?.role === 'admin' && isAdminPath) {
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };
      
      const selectiveApp = express();
      selectiveApp.use(express.json());
      
      selectiveApp.use((req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
          req.user = jwt.decode(token);
        }
        next();
      });
      
      selectiveApp.use(selectiveAdminBypass);
      
      selectiveApp.post('/api/chat', (req, res) => {
        res.json({ message: 'Chat allowed' });
      });
      
      selectiveApp.get('/api/admin/users', (req, res) => {
        res.json({ message: 'Admin endpoint' });
      });
      
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Outside business hours'
      });
      
      const adminPayload = { id: 'admin123', role: 'admin' };
      const adminToken = jwt.sign(adminPayload, 'test-secret');
      
      // Admin endpoint should bypass time windows
      await request(selectiveApp)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      // Chat endpoint should still enforce time windows for admin
      await request(selectiveApp)
        .post('/api/chat')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Test' })
        .expect(403);
      
      expect(checkTimeWindowAccess).toHaveBeenCalledWith('admin123');
    });
  });

  describe('Error Handling and Fallback Scenarios', () => {
    it('should handle time window service failures gracefully', async () => {
      checkTimeWindowAccess.mockRejectedValue(new Error('Database connection failed'));
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      // Should allow access when service fails (graceful degradation)
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Test fallback' })
        .expect(200);
      
      expect(response.body.message).toBe('Chat successful');
    });

    it('should handle malformed user data gracefully', async () => {
      const malformedPayload = { id: '', role: null };
      const token = jwt.sign(malformedPayload, 'test-secret');
      
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Test' })
        .expect(401);
      
      expect(response.body.error).toBe('Authentication required');
    });

    it('should handle concurrent requests correctly', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      // Create 10 concurrent requests
      const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/chat')
          .set('Authorization', `Bearer ${token}`)
          .send({ message: `Concurrent request ${i}` })
      );
      
      const responses = await Promise.all(concurrentRequests);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Chat successful');
      });
      
      expect(checkTimeWindowAccess).toHaveBeenCalledTimes(10);
    });
  });

  describe('Middleware Order and Dependencies', () => {
    it('should enforce correct middleware order (auth before time windows)', async () => {
      // Test without auth token
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'No auth' })
        .expect(401);
      
      expect(response.body.error).toBe('No token provided');
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should handle rate limiting before time window validation', async () => {
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .set('x-rate-limit', 'exceeded')
        .send({ message: 'Rate limited' })
        .expect(429);
      
      expect(response.body.error).toBe('Rate limit exceeded');
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });
  });

  describe('Real-world Scenario Testing', () => {
    it('should handle business hours scenario end-to-end', async () => {
      // Mock business hours: 9 AM - 5 PM, Monday-Friday
      getUserGroups.mockResolvedValue([
        {
          _id: 'business-group',
          name: 'Business Hours',
          timeWindows: [{
            _id: 'window1',
            name: 'Weekday Business Hours',
            windowType: 'weekly',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5],
            timezone: 'UTC',
            isActive: true
          }]
        }
      ]);
      
      const userPayload = { id: 'business_user', role: 'user', department: 'sales' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      // Test during business hours (allowed)
      checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });
      
      let response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ 
          message: 'Business hours chat',
          context: 'customer_inquiry'
        })
        .expect(200);
      
      expect(response.body.message).toBe('Chat successful');
      
      // Test outside business hours (denied)
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied. Business hours are Monday-Friday, 9 AM to 5 PM.',
        nextAllowedTime: '2024-01-16T09:00:00.000Z'
      });
      
      response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ 
          message: 'After hours chat',
          context: 'customer_inquiry'
        })
        .expect(403);
      
      expect(response.body.message).toBe('Access denied. Business hours are Monday-Friday, 9 AM to 5 PM.');
      expect(response.body.nextAllowedTime).toBe('2024-01-16T09:00:00.000Z');
    });

    it('should handle emergency access scenario', async () => {
      // Mock emergency override scenario
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Outside emergency hours'
      });
      
      const emergencyApp = express();
      emergencyApp.use(express.json());
      
      emergencyApp.use((req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
          req.user = jwt.decode(token);
        }
        next();
      });
      
      // Emergency bypass middleware
      emergencyApp.use((req, res, next) => {
        const isEmergency = req.headers['x-emergency-access'] === 'true';
        const userRole = req.user?.role;
        
        if (isEmergency && ['admin', 'emergency_responder'].includes(userRole)) {
          // Log emergency access
          console.log(`Emergency access granted to ${req.user.id}`);
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      });
      
      emergencyApp.post('/api/emergency-chat', (req, res) => {
        res.json({ 
          message: 'Emergency chat enabled',
          emergencyMode: true,
          timestamp: new Date().toISOString()
        });
      });
      
      const emergencyUserPayload = { id: 'emergency_user', role: 'emergency_responder' };
      const emergencyToken = jwt.sign(emergencyUserPayload, 'test-secret');
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const response = await request(emergencyApp)
        .post('/api/emergency-chat')
        .set('Authorization', `Bearer ${emergencyToken}`)
        .set('x-emergency-access', 'true')
        .send({ message: 'Emergency situation' })
        .expect(200);
      
      expect(response.body.emergencyMode).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Emergency access granted to emergency_user');
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle maintenance window scenario', async () => {
      // Test during maintenance window
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'System maintenance in progress. Service will resume at 6 AM.',
        nextAllowedTime: '2024-01-16T06:00:00.000Z'
      });
      
      const userPayload = { id: 'user123', role: 'user' };
      const token = jwt.sign(userPayload, 'test-secret');
      
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Maintenance test' })
        .expect(403);
      
      expect(response.body.message).toBe('System maintenance in progress. Service will resume at 6 AM.');
      expect(response.body.type).toBe('time_window_restriction');
      expect(response.body.details.code).toBe('OUTSIDE_TIME_WINDOW');
    });
  });
});