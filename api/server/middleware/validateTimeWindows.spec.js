const validateTimeWindows = require('./validateTimeWindows');
const { checkTimeWindowAccess } = require('~/server/services/TimeWindowService');
const { logger } = require('@librechat/data-schemas');

// Mock dependencies
jest.mock('~/server/services/TimeWindowService', () => ({
  checkTimeWindowAccess: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('validateTimeWindows middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user123' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  it('should call next() when user has access', async () => {
    checkTimeWindowAccess.mockResolvedValue({ isAllowed: true });

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123', {
      defaultAllowWhenNoGroups: false,
      defaultAllowWhenNoTimeWindows: true
    });
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('should return 403 when user does not have access', async () => {
    const accessResult = {
      isAllowed: false,
      message: 'Access denied. You are currently outside your allowed time windows.',
      nextAllowedTime: '2024-01-15T09:00:00.000Z',
    };
    checkTimeWindowAccess.mockResolvedValue(accessResult);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123', {
      defaultAllowWhenNoGroups: false,
      defaultAllowWhenNoTimeWindows: true
    });
    expect(logger.warn).toHaveBeenCalledWith(
      `[validateTimeWindows] Access denied for user user123: ${accessResult.message}`
    );
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Time Window Restriction',
      message: accessResult.message,
      type: 'time_window_restriction',
      nextAllowedTime: accessResult.nextAllowedTime,
      details: {
        code: 'OUTSIDE_TIME_WINDOW',
        canRetryAt: accessResult.nextAllowedTime,
      }
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 with default message when access is denied without message', async () => {
    const accessResult = {
      isAllowed: false,
    };
    checkTimeWindowAccess.mockResolvedValue(accessResult);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Time Window Restriction',
      message: 'You are currently outside your allowed time windows.',
      type: 'time_window_restriction',
      nextAllowedTime: undefined,
      details: {
        code: 'OUTSIDE_TIME_WINDOW',
        canRetryAt: undefined,
      }
    });
  });

  it('should return 403 with nextAllowedTime when provided', async () => {
    const accessResult = {
      isAllowed: false,
      message: 'Access denied. Next allowed time is 9 AM.',
      nextAllowedTime: '2024-01-16T09:00:00.000Z',
    };
    checkTimeWindowAccess.mockResolvedValue(accessResult);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      nextAllowedTime: '2024-01-16T09:00:00.000Z',
      details: {
        code: 'OUTSIDE_TIME_WINDOW',
        canRetryAt: '2024-01-16T09:00:00.000Z',
      }
    }));
  });

  it('should return 401 when user is not authenticated', async () => {
    mockReq.user = null;

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      type: 'auth_required'
    });
    expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when user id is missing', async () => {
    mockReq.user = { name: 'Test User' }; // User object without id

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      type: 'auth_required'
    });
    expect(checkTimeWindowAccess).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when checkTimeWindowAccess throws an error (graceful fallback)', async () => {
    const error = new Error('Time window service unavailable');
    checkTimeWindowAccess.mockRejectedValue(error);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(checkTimeWindowAccess).toHaveBeenCalledWith('user123', {
      defaultAllowWhenNoGroups: false,
      defaultAllowWhenNoTimeWindows: true
    });
    expect(logger.error).toHaveBeenCalledWith(
      '[validateTimeWindows] Error in time window validation middleware:',
      error
    );
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('should handle undefined user object gracefully', async () => {
    mockReq.user = undefined;

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      type: 'auth_required'
    });
  });

  it('should handle empty user id gracefully', async () => {
    mockReq.user = { id: '' };

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      type: 'auth_required'
    });
  });

  it('should handle user id that is null', async () => {
    mockReq.user = { id: null };

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Authentication required',
      type: 'auth_required'
    });
  });

  it('should properly log access denial with custom message', async () => {
    const customMessage = 'Custom access denied message for testing';
    const accessResult = {
      isAllowed: false,
      message: customMessage,
      nextAllowedTime: null,
    };
    checkTimeWindowAccess.mockResolvedValue(accessResult);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    expect(logger.warn).toHaveBeenCalledWith(
      `[validateTimeWindows] Access denied for user user123: ${customMessage}`
    );
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      message: customMessage,
    }));
  });

  it('should handle response when checkTimeWindowAccess returns unexpected format', async () => {
    // Return malformed response (missing isAllowed property)
    checkTimeWindowAccess.mockResolvedValue({
      message: 'Some message without isAllowed',
    });

    await validateTimeWindows(mockReq, mockRes, mockNext);

    // Should treat as access denied since isAllowed is falsy
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle when checkTimeWindowAccess returns null', async () => {
    checkTimeWindowAccess.mockResolvedValue(null);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    // Should treat null as access denied
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Time Window Restriction',
      message: 'You are currently outside your allowed time windows.',
      type: 'time_window_restriction',
      nextAllowedTime: undefined,
      details: {
        code: 'OUTSIDE_TIME_WINDOW',
        canRetryAt: undefined,
      }
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle when checkTimeWindowAccess returns undefined', async () => {
    checkTimeWindowAccess.mockResolvedValue(undefined);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    // Should treat undefined as access denied
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should properly format error response for client consumption', async () => {
    const accessResult = {
      isAllowed: false,
      message: 'Business hours only: Monday-Friday 9AM-5PM',
      nextAllowedTime: '2024-01-16T09:00:00.000Z',
    };
    checkTimeWindowAccess.mockResolvedValue(accessResult);

    await validateTimeWindows(mockReq, mockRes, mockNext);

    const expectedResponse = {
      error: 'Time Window Restriction',
      message: 'Business hours only: Monday-Friday 9AM-5PM',
      type: 'time_window_restriction',
      nextAllowedTime: '2024-01-16T09:00:00.000Z',
      details: {
        code: 'OUTSIDE_TIME_WINDOW',
        canRetryAt: '2024-01-16T09:00:00.000Z',
      }
    };

    expect(mockRes.json).toHaveBeenCalledWith(expectedResponse);
  });
});