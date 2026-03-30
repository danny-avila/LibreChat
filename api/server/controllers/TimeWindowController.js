const { logger } = require('@librechat/data-schemas');
const { addTimeWindow, updateTimeWindow, removeTimeWindow, getGroup } = require('~/models/Group');

/**
 * Add time window to group
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const addTimeWindowHandler = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const timeWindowData = req.body;

    // Validate required fields
    if (!timeWindowData.name) {
      return res.status(400).json({
        success: false,
        message: 'Time window name is required',
      });
    }

    if (!timeWindowData.windowType) {
      return res.status(400).json({
        success: false,
        message: 'Window type is required',
      });
    }

    // Validate window type specific fields
    if (timeWindowData.windowType === 'daily' || timeWindowData.windowType === 'weekly') {
      if (!timeWindowData.startTime || !timeWindowData.endTime) {
        return res.status(400).json({
          success: false,
          message: 'Start time and end time are required for daily/weekly windows',
        });
      }
      
      if (timeWindowData.windowType === 'weekly' && (!timeWindowData.daysOfWeek || timeWindowData.daysOfWeek.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Days of week are required for weekly windows',
        });
      }
    }

    if (timeWindowData.windowType === 'date_range') {
      if (!timeWindowData.startDate || !timeWindowData.endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required for date range windows',
        });
      }
    }

    // Set default values
    const windowToAdd = {
      name: timeWindowData.name,
      windowType: timeWindowData.windowType,
      startTime: timeWindowData.startTime || null,
      endTime: timeWindowData.endTime || null,
      daysOfWeek: timeWindowData.daysOfWeek || [],
      startDate: timeWindowData.startDate || null,
      endDate: timeWindowData.endDate || null,
      timezone: timeWindowData.timezone || 'UTC',
      isActive: timeWindowData.isActive !== undefined ? timeWindowData.isActive : true,
    };

    const updatedGroup = await addTimeWindow(groupId, windowToAdd);

    if (!updatedGroup) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    logger.info(`Time window added to group ${groupId}`);

    res.status(201).json({
      success: true,
      message: 'Time window added successfully',
      data: updatedGroup,
    });
  } catch (error) {
    logger.error('Error adding time window:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add time window',
    });
  }
};

/**
 * Update time window in group
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const updateTimeWindowHandler = async (req, res) => {
  try {
    const { id: groupId, windowId } = req.params;
    const updateData = req.body;

    // Validate window type specific fields if window type is being updated
    if (updateData.windowType) {
      if (updateData.windowType === 'daily' || updateData.windowType === 'weekly') {
        if ((!updateData.startTime && updateData.startTime !== undefined) || 
            (!updateData.endTime && updateData.endTime !== undefined)) {
          return res.status(400).json({
            success: false,
            message: 'Start time and end time are required for daily/weekly windows',
          });
        }
        
        if (updateData.windowType === 'weekly' && 
            updateData.daysOfWeek !== undefined && 
            (!updateData.daysOfWeek || updateData.daysOfWeek.length === 0)) {
          return res.status(400).json({
            success: false,
            message: 'Days of week are required for weekly windows',
          });
        }
      }

      if (updateData.windowType === 'date_range') {
        if ((!updateData.startDate && updateData.startDate !== undefined) || 
            (!updateData.endDate && updateData.endDate !== undefined)) {
          return res.status(400).json({
            success: false,
            message: 'Start date and end date are required for date range windows',
          });
        }
      }
    }

    const updatedGroup = await updateTimeWindow(groupId, windowId, updateData);

    if (!updatedGroup) {
      return res.status(404).json({
        success: false,
        message: 'Group or time window not found',
      });
    }

    logger.info(`Time window ${windowId} updated in group ${groupId}`);

    res.json({
      success: true,
      message: 'Time window updated successfully',
      data: updatedGroup,
    });
  } catch (error) {
    logger.error('Error updating time window:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update time window',
    });
  }
};

/**
 * Remove time window from group
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const removeTimeWindowHandler = async (req, res) => {
  try {
    const { id: groupId, windowId } = req.params;

    const updatedGroup = await removeTimeWindow(groupId, windowId);

    if (!updatedGroup) {
      return res.status(404).json({
        success: false,
        message: 'Group or time window not found',
      });
    }

    logger.info(`Time window ${windowId} removed from group ${groupId}`);

    res.json({
      success: true,
      message: 'Time window removed successfully',
      data: updatedGroup,
    });
  } catch (error) {
    logger.error('Error removing time window:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove time window',
    });
  }
};

module.exports = {
  addTimeWindowHandler,
  updateTimeWindowHandler,
  removeTimeWindowHandler,
};