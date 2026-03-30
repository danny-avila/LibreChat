const { logger } = require('@librechat/data-schemas');
const {
  addTimeWindowHandler,
  updateTimeWindowHandler,
  removeTimeWindowHandler,
} = require('./TimeWindowController');

// Mock the Group model functions
jest.mock('~/models/Group', () => ({
  addTimeWindow: jest.fn(),
  updateTimeWindow: jest.fn(),
  removeTimeWindow: jest.fn(),
}));

const { addTimeWindow, updateTimeWindow, removeTimeWindow } = require('~/models/Group');

// Mock logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TimeWindowController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      params: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('addTimeWindowHandler', () => {
    const validTimeWindowData = {
      name: 'Business Hours',
      windowType: 'daily',
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'UTC',
      isActive: true,
    };

    it('should add a daily time window successfully', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = validTimeWindowData;

      const mockGroup = { _id: 'group123', timeWindows: [validTimeWindowData] };
      addTimeWindow.mockResolvedValue(mockGroup);

      await addTimeWindowHandler(mockReq, mockRes);

      expect(addTimeWindow).toHaveBeenCalledWith('group123', {
        name: 'Business Hours',
        windowType: 'daily',
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [],
        startDate: null,
        endDate: null,
        timezone: 'UTC',
        isActive: true,
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Time window added successfully',
        data: mockGroup,
      });
      expect(logger.info).toHaveBeenCalledWith('Time window added to group group123');
    });

    it('should add a weekly time window successfully', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = {
        ...validTimeWindowData,
        windowType: 'weekly',
        daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
      };

      const mockGroup = { _id: 'group123', timeWindows: [] };
      addTimeWindow.mockResolvedValue(mockGroup);

      await addTimeWindowHandler(mockReq, mockRes);

      expect(addTimeWindow).toHaveBeenCalledWith('group123', expect.objectContaining({
        windowType: 'weekly',
        daysOfWeek: [1, 2, 3, 4, 5],
      }));
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should add a date range time window successfully', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = {
        name: 'Holiday Period',
        windowType: 'date_range',
        startDate: '2024-12-20',
        endDate: '2024-12-31',
        timezone: 'UTC',
        isActive: true,
      };

      const mockGroup = { _id: 'group123', timeWindows: [] };
      addTimeWindow.mockResolvedValue(mockGroup);

      await addTimeWindowHandler(mockReq, mockRes);

      expect(addTimeWindow).toHaveBeenCalledWith('group123', expect.objectContaining({
        windowType: 'date_range',
        startDate: '2024-12-20',
        endDate: '2024-12-31',
        startTime: null,
        endTime: null,
        daysOfWeek: [],
      }));
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 if name is missing', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = { windowType: 'daily' };

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Time window name is required',
      });
    });

    it('should return 400 if windowType is missing', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = { name: 'Test Window' };

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Window type is required',
      });
    });

    it('should return 400 if daily window is missing start/end time', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = {
        name: 'Test Window',
        windowType: 'daily',
      };

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Start time and end time are required for daily/weekly windows',
      });
    });

    it('should return 400 if weekly window is missing days of week', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = {
        name: 'Test Window',
        windowType: 'weekly',
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [],
      };

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Days of week are required for weekly windows',
      });
    });

    it('should return 400 if date range window is missing dates', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = {
        name: 'Test Window',
        windowType: 'date_range',
      };

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Start date and end date are required for date range windows',
      });
    });

    it('should return 404 if group is not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockReq.body = validTimeWindowData;

      addTimeWindow.mockResolvedValue(null);

      await addTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group not found',
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { id: 'group123' };
      mockReq.body = validTimeWindowData;

      const error = new Error('Database error');
      addTimeWindow.mockRejectedValue(error);

      await addTimeWindowHandler(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error adding time window:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Database error',
      });
    });
  });

  describe('updateTimeWindowHandler', () => {
    const validUpdateData = {
      name: 'Updated Business Hours',
      startTime: '08:00',
      endTime: '18:00',
      isActive: false,
    };

    it('should update a time window successfully', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };
      mockReq.body = validUpdateData;

      const mockGroup = { _id: 'group123', timeWindows: [] };
      updateTimeWindow.mockResolvedValue(mockGroup);

      await updateTimeWindowHandler(mockReq, mockRes);

      expect(updateTimeWindow).toHaveBeenCalledWith('group123', 'window456', validUpdateData);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Time window updated successfully',
        data: mockGroup,
      });
      expect(logger.info).toHaveBeenCalledWith('Time window window456 updated in group group123');
    });

    it('should validate window type specific fields during update', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };
      mockReq.body = {
        windowType: 'weekly',
        daysOfWeek: [],
      };

      await updateTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Days of week are required for weekly windows',
      });
    });

    it('should validate date range fields during update', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };
      mockReq.body = {
        windowType: 'date_range',
        startDate: '2024-01-01',
        endDate: undefined,
      };

      await updateTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Start date and end date are required for date range windows',
      });
    });

    it('should return 404 if group or window not found', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };
      mockReq.body = validUpdateData;

      updateTimeWindow.mockResolvedValue(null);

      await updateTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group or time window not found',
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };
      mockReq.body = validUpdateData;

      const error = new Error('Update failed');
      updateTimeWindow.mockRejectedValue(error);

      await updateTimeWindowHandler(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error updating time window:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Update failed',
      });
    });
  });

  describe('removeTimeWindowHandler', () => {
    it('should remove a time window successfully', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };

      const mockGroup = { _id: 'group123', timeWindows: [] };
      removeTimeWindow.mockResolvedValue(mockGroup);

      await removeTimeWindowHandler(mockReq, mockRes);

      expect(removeTimeWindow).toHaveBeenCalledWith('group123', 'window456');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Time window removed successfully',
        data: mockGroup,
      });
      expect(logger.info).toHaveBeenCalledWith('Time window window456 removed from group group123');
    });

    it('should return 404 if group or window not found', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };

      removeTimeWindow.mockResolvedValue(null);

      await removeTimeWindowHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group or time window not found',
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { id: 'group123', windowId: 'window456' };

      const error = new Error('Remove failed');
      removeTimeWindow.mockRejectedValue(error);

      await removeTimeWindowHandler(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error removing time window:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Remove failed',
      });
    });
  });
});