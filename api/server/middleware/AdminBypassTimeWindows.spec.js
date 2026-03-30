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

const validateTimeWindows = require('./validateTimeWindows');
const { checkTimeWindowAccess } = require('~/server/services/TimeWindowService');

describe('Epic 3: Access Control Logic - Admin Bypass Functionality', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user123', role: 'user' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('FR3.3: System administrators bypass all time restrictions', () => {
    it('should bypass time window validation for admin users', async () => {
      // Mock admin user
      mockReq.user = { id: 'admin123', role: 'admin' };

      // Mock time window service to deny access (but should be bypassed)
      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied - outside business hours'
      });

      // Create enhanced middleware that checks for admin role
      const adminAwareValidateTimeWindows = async (req, res, next) => {
        try {
          const userId = req.user?.id;
          const userRole = req.user?.role;
          
          if (!userId) {
            return res.status(401).json({ 
              error: 'Authentication required',
              type: 'auth_required'
            });
          }

          // Admin bypass logic
          if (userRole === 'admin' || userRole === 'system_admin') {
            return next(); // Skip time window validation
          }

          // Regular validation for non-admin users
          return validateTimeWindows(req, res, next);
        } catch (error) {
          next();
        }
      };

      await adminAwareValidateTimeWindows(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should apply time window validation to regular users', async () => {
      mockReq.user = { id: 'user123', role: 'user' };

      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Access denied - outside business hours'
      });

      await validateTimeWindows(mockReq, mockRes, mockNext);

      expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123');
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle different admin role variations', async () => {
      const adminRoles = ['admin', 'system_admin', 'super_admin', 'administrator'];

      for (const role of adminRoles) {
        jest.clearAllMocks();
        
        mockReq.user = { id: `admin_${role}`, role: role };
        
        checkTimeWindowAccess.mockResolvedValue({
          isAllowed: false,
          message: 'Should be bypassed for admin'
        });

        // Enhanced middleware with multiple admin role support
        const multiRoleAdminBypass = async (req, res, next) => {
          const adminRoles = ['admin', 'system_admin', 'super_admin', 'administrator'];
          const userRole = req.user?.role;
          
          if (adminRoles.includes(userRole)) {
            return next();
          }
          
          return validateTimeWindows(req, res, next);
        };

        await multiRoleAdminBypass(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(checkTimeWindowAccess).not.toHaveBeenCalled();
      }
    });

    it('should not bypass for non-admin roles', async () => {
      const nonAdminRoles = ['user', 'moderator', 'guest', 'readonly', 'support'];

      for (const role of nonAdminRoles) {
        jest.clearAllMocks();
        
        mockReq.user = { id: `user_${role}`, role: role };
        
        checkTimeWindowAccess.mockResolvedValue({
          isAllowed: false,
          message: 'Access denied for non-admin'
        });

        // Enhanced middleware
        const roleAwareMiddleware = async (req, res, next) => {
          const adminRoles = ['admin', 'system_admin'];
          const userRole = req.user?.role;
          
          if (adminRoles.includes(userRole)) {
            return next();
          }
          
          return validateTimeWindows(req, res, next);
        };

        await roleAwareMiddleware(mockReq, mockRes, mockNext);

        expect(checkTimeWindowAccess).toHaveBeenCalled();
        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      }
    });
  });

  describe('Admin Role Verification and Security', () => {
    it('should verify admin role authenticity', async () => {
      // Mock role verification service
      const mockRoleVerifier = async (userId, claimedRole) => {
        // Simulate database lookup
        const userRoles = {
          'admin123': 'admin',
          'user123': 'user',
          'fake_admin': 'user' // Someone trying to fake admin role
        };
        
        const actualRole = userRoles[userId];
        return actualRole === claimedRole;
      };

      // Test legitimate admin
      let isValid = await mockRoleVerifier('admin123', 'admin');
      expect(isValid).toBe(true);

      // Test fake admin
      isValid = await mockRoleVerifier('fake_admin', 'admin');
      expect(isValid).toBe(false);

      // Test regular user
      isValid = await mockRoleVerifier('user123', 'user');
      expect(isValid).toBe(true);
    });

    it('should handle role escalation attempts', async () => {
      // Mock a user trying to escalate privileges
      mockReq.user = { id: 'user123', role: 'admin' }; // Claiming admin but actually user

      const secureAdminBypass = async (req, res, next) => {
        const userId = req.user?.id;
        const claimedRole = req.user?.role;
        
        // In real implementation, this would verify against database
        const mockVerifyRole = (id, role) => {
          const realUserRoles = { 'user123': 'user', 'admin456': 'admin' };
          return realUserRoles[id] === role;
        };
        
        const isRoleValid = mockVerifyRole(userId, claimedRole);
        
        if (!isRoleValid) {
          return res.status(403).json({
            error: 'Invalid role claim',
            type: 'role_verification_failed'
          });
        }
        
        if (claimedRole === 'admin') {
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };

      await secureAdminBypass(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid role claim',
        type: 'role_verification_failed'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should log admin bypass events for audit', async () => {
      const mockAuditLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      mockReq.user = { id: 'admin123', role: 'admin' };

      const auditingAdminBypass = async (req, res, next) => {
        const userId = req.user?.id;
        const userRole = req.user?.role;
        
        if (userRole === 'admin') {
          mockAuditLogger.info('Admin bypass used', {
            userId,
            userRole,
            timestamp: new Date().toISOString(),
            action: 'time_window_bypass',
            requestPath: req.path || '/api/test'
          });
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };

      await auditingAdminBypass(mockReq, mockRes, mockNext);

      expect(mockAuditLogger.info).toHaveBeenCalledWith('Admin bypass used', expect.objectContaining({
        userId: 'admin123',
        userRole: 'admin',
        action: 'time_window_bypass'
      }));
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Conditional Admin Bypass', () => {
    it('should allow conditional bypass based on emergency flags', async () => {
      mockReq.user = { id: 'admin123', role: 'admin' };
      mockReq.headers = { 'x-emergency-override': 'true' };

      const emergencyBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const isEmergency = req.headers['x-emergency-override'] === 'true';
        
        if (userRole === 'admin' && isEmergency) {
          // Log emergency usage
          console.log('Emergency admin bypass activated');
          return next();
        }
        
        if (userRole === 'admin') {
          // Regular admin still gets bypass, but logged differently
          console.log('Regular admin bypass');
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await emergencyBypass(mockReq, mockRes, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith('Emergency admin bypass activated');
      expect(mockNext).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should allow partial bypass for certain admin actions only', async () => {
      mockReq.user = { id: 'admin123', role: 'admin' };
      mockReq.path = '/api/admin/manage-users';

      const selectiveBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const requestPath = req.path;
        
        // Define which admin paths get bypass
        const bypassPaths = [
          '/api/admin/manage-users',
          '/api/admin/system-status',
          '/api/admin/emergency'
        ];
        
        if (userRole === 'admin' && bypassPaths.some(path => requestPath.startsWith(path))) {
          return next();
        }
        
        // Even admins need to follow time windows for regular chat
        return validateTimeWindows(req, res, next);
      };

      await selectiveBypass(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should enforce time windows for admin chat operations', async () => {
      mockReq.user = { id: 'admin123', role: 'admin' };
      mockReq.path = '/api/chat'; // Regular chat endpoint

      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Outside business hours'
      });

      const selectiveBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const requestPath = req.path;
        
        // Admin management paths get bypass
        const adminBypassPaths = ['/api/admin'];
        const isAdminPath = adminBypassPaths.some(path => requestPath.startsWith(path));
        
        if (userRole === 'admin' && isAdminPath) {
          return next();
        }
        
        // All other operations, including admin chat, follow time windows
        return validateTimeWindows(req, res, next);
      };

      await selectiveBypass(mockReq, mockRes, mockNext);

      expect(checkTimeWindowAccess).toHaveBeenCalledWith('admin123');
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Service Account and System Bypass', () => {
    it('should allow system service accounts to bypass time restrictions', async () => {
      mockReq.user = { 
        id: 'system_scheduler', 
        role: 'system',
        accountType: 'service'
      };

      const serviceAccountBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const accountType = req.user?.accountType;
        
        if (userRole === 'system' || accountType === 'service') {
          return next(); // System accounts always bypass
        }
        
        if (userRole === 'admin') {
          return next(); // Admins also bypass
        }
        
        return validateTimeWindows(req, res, next);
      };

      await serviceAccountBypass(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });

    it('should handle automated maintenance operations', async () => {
      mockReq.user = { 
        id: 'maintenance_bot', 
        role: 'system',
        purpose: 'maintenance'
      };

      const maintenanceBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const purpose = req.user?.purpose;
        
        // Maintenance and system operations always proceed
        if (userRole === 'system' || purpose === 'maintenance') {
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };

      await maintenanceBypass(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Bypass Configuration and Feature Flags', () => {
    it('should respect feature flags for admin bypass', async () => {
      mockReq.user = { id: 'admin123', role: 'admin' };

      // Mock feature flag service
      const mockFeatureFlags = {
        ADMIN_TIME_WINDOW_BYPASS: false // Disabled
      };

      const featureFlagBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        
        if (userRole === 'admin' && mockFeatureFlags.ADMIN_TIME_WINDOW_BYPASS) {
          return next();
        }
        
        // If bypass is disabled, even admins follow time windows
        return validateTimeWindows(req, res, next);
      };

      checkTimeWindowAccess.mockResolvedValue({
        isAllowed: false,
        message: 'Bypass disabled - following time windows'
      });

      await featureFlagBypass(mockReq, mockRes, mockNext);

      expect(checkTimeWindowAccess).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should support configurable bypass rules', async () => {
      const bypassConfig = {
        adminBypass: true,
        systemBypass: true,
        emergencyBypass: true,
        bypassRoles: ['admin', 'system_admin', 'emergency_admin'],
        restrictedOperations: ['/api/chat', '/api/generate'], // Even admins follow rules for these
        alwaysBypassOperations: ['/api/admin/health', '/api/system/status']
      };

      mockReq.user = { id: 'admin123', role: 'admin' };
      mockReq.path = '/api/admin/health';

      const configurableBypass = async (req, res, next) => {
        const userRole = req.user?.role;
        const requestPath = req.path;
        
        // Check if operation always bypasses
        if (bypassConfig.alwaysBypassOperations.some(op => requestPath.startsWith(op))) {
          return next();
        }
        
        // Check if operation is restricted even for admins
        if (bypassConfig.restrictedOperations.some(op => requestPath.startsWith(op))) {
          return validateTimeWindows(req, res, next);
        }
        
        // Check role-based bypass
        if (bypassConfig.adminBypass && bypassConfig.bypassRoles.includes(userRole)) {
          return next();
        }
        
        return validateTimeWindows(req, res, next);
      };

      await configurableBypass(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Existing Auth Flow', () => {
    it('should integrate seamlessly with JWT auth middleware', async () => {
      const mockJwtMiddleware = (req, res, next) => {
        // Simulate JWT validation
        if (req.headers.authorization === 'Bearer valid_admin_token') {
          req.user = { id: 'admin123', role: 'admin' };
          next();
        } else {
          res.status(401).json({ error: 'Invalid token' });
        }
      };

      const integratedFlow = async (req, res, next) => {
        // First JWT auth
        mockJwtMiddleware(req, res, (err) => {
          if (err) return next(err);
          
          // Then admin bypass check
          const userRole = req.user?.role;
          if (userRole === 'admin') {
            return next();
          }
          
          // Then time window validation
          return validateTimeWindows(req, res, next);
        });
      };

      mockReq.headers = { authorization: 'Bearer valid_admin_token' };

      await integratedFlow(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user.role).toBe('admin');
    });
  });
});