const { ResourceType } = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { getSkillById } = require('~/models');

/**
 * Skill-specific middleware factory that checks skill access permissions.
 * Wraps the generic `canAccessResource` with the SKILL resource type and
 * `getSkillById` as the ID resolver.
 *
 * @param {Object} options
 * @param {number} options.requiredPermission - Permission bit required (1=view, 2=edit, 4=delete, 8=share)
 * @param {string} [options.resourceIdParam='id'] - Route parameter name holding the skill id
 * @returns {Function} Express middleware
 */
const canAccessSkillResource = (options) => {
  const { requiredPermission, resourceIdParam = 'id' } = options || {};

  if (!requiredPermission || typeof requiredPermission !== 'number') {
    throw new Error('canAccessSkillResource: requiredPermission is required and must be a number');
  }

  return canAccessResource({
    resourceType: ResourceType.SKILL,
    requiredPermission,
    resourceIdParam,
    idResolver: getSkillById,
  });
};

module.exports = {
  canAccessSkillResource,
};
