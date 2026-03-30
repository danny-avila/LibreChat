const { Types } = require('mongoose');

/**
 * Validation middleware for group creation
 */
const validateGroupCreate = (req, res, next) => {
  const { name, description, isActive } = req.body;
  const errors = [];

  // Validate name
  if (!name || typeof name !== 'string') {
    errors.push({ field: 'name', message: 'Group name is required' });
  } else if (name.trim().length < 2 || name.trim().length > 50) {
    errors.push({ field: 'name', message: 'Group name must be between 2 and 50 characters' });
  }

  // Validate description
  if (description !== undefined) {
    if (typeof description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (description.length > 500) {
      errors.push({ field: 'description', message: 'Description cannot exceed 500 characters' });
    }
  }

  // Validate isActive
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  // Sanitize data
  req.body.name = name.trim();
  if (description) req.body.description = description.trim();

  next();
};

/**
 * Validation middleware for group updates
 */
const validateGroupUpdate = (req, res, next) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  const errors = [];

  // Validate ID parameter
  if (!Types.ObjectId.isValid(id)) {
    errors.push({ field: 'id', message: 'Invalid group ID' });
  }

  // Validate name (optional)
  if (name !== undefined) {
    if (typeof name !== 'string') {
      errors.push({ field: 'name', message: 'Name must be a string' });
    } else if (name.trim().length < 2 || name.trim().length > 50) {
      errors.push({ field: 'name', message: 'Group name must be between 2 and 50 characters' });
    }
  }

  // Validate description (optional)
  if (description !== undefined) {
    if (typeof description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (description.length > 500) {
      errors.push({ field: 'description', message: 'Description cannot exceed 500 characters' });
    }
  }

  // Validate isActive (optional)
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive must be a boolean' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  // Sanitize data
  if (name) req.body.name = name.trim();
  if (description) req.body.description = description.trim();

  next();
};

/**
 * Validation middleware for time window creation/update (placeholder for future Epic 2)
 */
const validateTimeWindow = (req, res, next) => {
  // This will be implemented in Epic 2: Time Window Configuration
  next();
};

/**
 * Validation middleware for bulk group assignments
 */
const validateBulkGroupAssignment = (req, res, next) => {
  const { groupId } = req.params;
  const { userIds } = req.body;
  const errors = [];

  // Validate group ID parameter
  if (!Types.ObjectId.isValid(groupId)) {
    errors.push({ field: 'groupId', message: 'Invalid group ID' });
  }

  // Validate userIds array
  if (!Array.isArray(userIds)) {
    errors.push({ field: 'userIds', message: 'User IDs must be an array' });
  } else if (userIds.length === 0) {
    errors.push({ field: 'userIds', message: 'User IDs array must not be empty' });
  } else {
    // Validate each user ID
    const invalidIds = userIds.filter(id => !Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      errors.push({ 
        field: 'userIds', 
        message: `Invalid user IDs: ${invalidIds.join(', ')}` 
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  next();
};

/**
 * Validation middleware for MongoDB ObjectId parameters
 */
const validateObjectId = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  
  if (!Types.ObjectId.isValid(value)) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: [{ field: paramName, message: `Invalid ${paramName}` }],
    });
  }
  
  next();
};

module.exports = {
  validateGroupCreate,
  validateGroupUpdate,
  validateTimeWindow,
  validateBulkGroupAssignment,
  validateObjectId,
};