const { tool } = require('@librechat/agents/langchain/tools');
const { formatLocationToolResult } = require('@librechat/api');

const locationSchema = {
  type: 'object',
  properties: {},
  required: [],
};

/**
 * Factory for the `get_location` tool, bound to the current request/user.
 * @param {{ userId?: string, req?: import('express').Request }} params
 * @returns {Promise<import('@librechat/agents/langchain/tools').DynamicStructuredTool>}
 */
module.exports = async function createLocationTool({ req } = {}) {
  return tool(
    async () => {
      const featureEnabled = req?.config?.location?.enabled !== false;
      const location = req?.user?.personalization?.location;
      return formatLocationToolResult(location, { featureEnabled });
    },
    {
      name: 'get_location',
      description:
        "Returns the user's current location (place, coordinates, timezone) when they have shared it. Use it to tailor language, regional context, units, or weather lookups.",
      schema: locationSchema,
    },
  );
};
