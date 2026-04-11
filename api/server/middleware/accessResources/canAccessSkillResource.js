const { ResourceType } = require('librechat-data-provider');
const { canAccessResource } = require('./canAccessResource');
const { getSkillById } = require('~/models');

/**
 * Skill ID resolver — maps a route param (the skill _id string) to the
 * canonical Skill document so `canAccessResource` can run an ACL check.
 *
 * @param {string} id - Skill ID from route parameter
 * @returns {Promise<Object|null>} Skill document with `_id`, or null if not found
 */
const resolveSkillId = async (id) => {
  return await getSkillById(id);
};

/**
 * Skill-specific middleware factory that checks skill access permissions.
 * Wraps the generic `canAccessResource` with the SKILL resource type and an
 * ID resolver that loads the skill from the DB.
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
    idResolver: resolveSkillId,
  });
};

module.exports = {
  canAccessSkillResource,
};
