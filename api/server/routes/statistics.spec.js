const request = require('supertest');
const express = require('express');
const statisticsRouter = require('./statistics');

// Mock the controller functions
const mockGetGroupLeaderboard = jest.fn();
const mockGetGroupStatistics = jest.fn();
const mockGetGroupMemberStatistics = jest.fn();
const mockGetUserLeaderboard = jest.fn();
const mockGetUserStatistics = jest.fn();

jest.mock('../controllers/GroupStatisticsController', () => ({
  getGroupLeaderboard: mockGetGroupLeaderboard,
  getGroupStatistics: mockGetGroupStatistics,
  getGroupMemberStatistics: mockGetGroupMemberStatistics
}));

jest.mock('../controllers/UserStatisticsController', () => ({
  getUserLeaderboard: mockGetUserLeaderboard,
  getUserStatistics: mockGetUserStatistics
}));

// Mock middleware
const mockRequireJwtAuth = jest.fn((req, res, next) => {
  req.user = { id: 'user1', role: 'ADMIN' };
  next();
});

const mockCheckAdmin = jest.fn((req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});

jest.mock('../middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth
}));

jest.mock('../middleware/roles', () => ({
  checkAdmin: mockCheckAdmin
}));

describe('Statistics Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/statistics', statisticsRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Default successful responses
    mockGetGroupLeaderboard.mockImplementation((req, res) => {
      res.json({ success: true, data: { groups: [] } });
    });
    mockGetGroupStatistics.mockImplementation((req, res) => {
      res.json({ success: true, data: { groupId: req.params.groupId } });
    });
    mockGetGroupMemberStatistics.mockImplementation((req, res) => {
      res.json({ success: true, data: { members: [] } });
    });
    mockGetUserLeaderboard.mockImplementation((req, res) => {
      res.json({ success: true, data: { users: [] } });
    });
    mockGetUserStatistics.mockImplementation((req, res) => {
      res.json({ success: true, data: { userId: req.params.userId } });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should apply JWT authentication to all routes', async () => {
      await request(app)
        .get('/api/statistics/users/leaderboard')
        .expect(200);

      expect(mockRequireJwtAuth).toHaveBeenCalled();
    });

    it('should apply admin check to all routes', async () => {
      await request(app)
        .get('/api/statistics/users/leaderboard')
        .expect(200);

      expect(mockCheckAdmin).toHaveBeenCalled();
    });

    it('should reject non-admin users', async () => {
      mockCheckAdmin.mockImplementationOnce((req, res, next) => {
        res.status(403).json({ message: 'Forbidden' });
      });

      await request(app)
        .get('/api/statistics/users/leaderboard')
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('Forbidden');
        });
    });
  });

  describe('User Statistics Routes', () => {
    describe('GET /users/leaderboard', () => {
      it('should call getUserLeaderboard controller', async () => {
        await request(app)
          .get('/api/statistics/users/leaderboard')
          .expect(200);

        expect(mockGetUserLeaderboard).toHaveBeenCalledTimes(1);
      });

      it('should pass query parameters to controller', async () => {
        await request(app)
          .get('/api/statistics/users/leaderboard?page=2&limit=10&sortBy=balance')
          .expect(200);

        expect(mockGetUserLeaderboard).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              page: '2',
              limit: '10',
              sortBy: 'balance'
            })
          }),
          expect.any(Object)
        );
      });
    });

    describe('GET /users/:userId', () => {
      it('should call getUserStatistics controller', async () => {
        const userId = 'user123';
        
        await request(app)
          .get(`/api/statistics/users/${userId}`)
          .expect(200);

        expect(mockGetUserStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              userId
            })
          }),
          expect.any(Object)
        );
      });

      it('should pass query options to controller', async () => {
        const userId = 'user123';
        
        await request(app)
          .get(`/api/statistics/users/${userId}?dateFrom=2024-01-01&includeHistory=true`)
          .expect(200);

        expect(mockGetUserStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { userId },
            query: expect.objectContaining({
              dateFrom: '2024-01-01',
              includeHistory: 'true'
            })
          }),
          expect.any(Object)
        );
      });
    });
  });

  describe('Group Statistics Routes', () => {
    describe('GET /groups/leaderboard', () => {
      it('should call getGroupLeaderboard controller', async () => {
        await request(app)
          .get('/api/statistics/groups/leaderboard')
          .expect(200);

        expect(mockGetGroupLeaderboard).toHaveBeenCalledTimes(1);
      });

      it('should pass query parameters to controller', async () => {
        await request(app)
          .get('/api/statistics/groups/leaderboard?page=1&limit=20&sortBy=totalTokens&sortOrder=desc')
          .expect(200);

        expect(mockGetGroupLeaderboard).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              page: '1',
              limit: '20',
              sortBy: 'totalTokens',
              sortOrder: 'desc'
            })
          }),
          expect.any(Object)
        );
      });

      it('should handle date range filters', async () => {
        await request(app)
          .get('/api/statistics/groups/leaderboard?dateFrom=2024-01-01&dateTo=2024-01-31')
          .expect(200);

        expect(mockGetGroupLeaderboard).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              dateFrom: '2024-01-01',
              dateTo: '2024-01-31'
            })
          }),
          expect.any(Object)
        );
      });

      it('should handle includeInactive filter', async () => {
        await request(app)
          .get('/api/statistics/groups/leaderboard?includeInactive=true')
          .expect(200);

        expect(mockGetGroupLeaderboard).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              includeInactive: 'true'
            })
          }),
          expect.any(Object)
        );
      });
    });

    describe('GET /groups/:groupId', () => {
      it('should call getGroupStatistics controller', async () => {
        const groupId = 'group123';
        
        await request(app)
          .get(`/api/statistics/groups/${groupId}`)
          .expect(200);

        expect(mockGetGroupStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              groupId
            })
          }),
          expect.any(Object)
        );
      });

      it('should pass query options to controller', async () => {
        const groupId = 'group123';
        
        await request(app)
          .get(`/api/statistics/groups/${groupId}?dateFrom=2024-01-01&includeMemberDetails=true`)
          .expect(200);

        expect(mockGetGroupStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { groupId },
            query: expect.objectContaining({
              dateFrom: '2024-01-01',
              includeMemberDetails: 'true'
            })
          }),
          expect.any(Object)
        );
      });
    });

    describe('GET /groups/:groupId/members', () => {
      it('should call getGroupMemberStatistics controller', async () => {
        const groupId = 'group123';
        
        await request(app)
          .get(`/api/statistics/groups/${groupId}/members`)
          .expect(200);

        expect(mockGetGroupMemberStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              groupId
            })
          }),
          expect.any(Object)
        );
      });

      it('should pass pagination and sorting parameters', async () => {
        const groupId = 'group123';
        
        await request(app)
          .get(`/api/statistics/groups/${groupId}/members?page=2&limit=25&sortBy=tokens&sortOrder=desc`)
          .expect(200);

        expect(mockGetGroupMemberStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { groupId },
            query: expect.objectContaining({
              page: '2',
              limit: '25',
              sortBy: 'tokens',
              sortOrder: 'desc'
            })
          }),
          expect.any(Object)
        );
      });

      it('should pass date range filters', async () => {
        const groupId = 'group123';
        
        await request(app)
          .get(`/api/statistics/groups/${groupId}/members?dateFrom=2024-01-01&dateTo=2024-01-31`)
          .expect(200);

        expect(mockGetGroupMemberStatistics).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { groupId },
            query: expect.objectContaining({
              dateFrom: '2024-01-01',
              dateTo: '2024-01-31'
            })
          }),
          expect.any(Object)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle controller errors for group leaderboard', async () => {
      mockGetGroupLeaderboard.mockImplementationOnce((req, res) => {
        res.status(500).json({ 
          success: false, 
          error: { message: 'Database error' }
        });
      });

      await request(app)
        .get('/api/statistics/groups/leaderboard')
        .expect(500)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.message).toBe('Database error');
        });
    });

    it('should handle controller errors for group statistics', async () => {
      mockGetGroupStatistics.mockImplementationOnce((req, res) => {
        res.status(404).json({ 
          success: false, 
          error: { message: 'Group not found' }
        });
      });

      await request(app)
        .get('/api/statistics/groups/nonexistent')
        .expect(404)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.message).toBe('Group not found');
        });
    });

    it('should handle controller errors for member statistics', async () => {
      mockGetGroupMemberStatistics.mockImplementationOnce((req, res) => {
        res.status(403).json({ 
          success: false, 
          error: { message: 'Forbidden' }
        });
      });

      await request(app)
        .get('/api/statistics/groups/group123/members')
        .expect(403)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.message).toBe('Forbidden');
        });
    });
  });

  describe('Route Parameter Validation', () => {
    it('should handle special characters in groupId', async () => {
      const groupId = 'group-123_test';
      
      await request(app)
        .get(`/api/statistics/groups/${groupId}`)
        .expect(200);

      expect(mockGetGroupStatistics).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { groupId }
        }),
        expect.any(Object)
      );
    });

    it('should handle special characters in userId', async () => {
      const userId = 'user-123_test@example.com';
      
      await request(app)
        .get(`/api/statistics/users/${encodeURIComponent(userId)}`)
        .expect(200);

      expect(mockGetUserStatistics).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { userId }
        }),
        expect.any(Object)
      );
    });
  });

  describe('HTTP Methods', () => {
    it('should only allow GET requests', async () => {
      await request(app)
        .post('/api/statistics/groups/leaderboard')
        .expect(404);

      await request(app)
        .put('/api/statistics/groups/group123')
        .expect(404);

      await request(app)
        .delete('/api/statistics/users/user123')
        .expect(404);
    });
  });
});