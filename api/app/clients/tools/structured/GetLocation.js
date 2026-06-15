const { Tool } = require('@librechat/agents/langchain/tools');
const { formatLocationToolResult } = require('@librechat/api');

const locationSchema = {
  type: 'object',
  properties: {},
  required: [],
};

/**
 * GetLocation - returns the user's shared location (place, coordinates, timezone).
 * Reads the resolved app config (admin feature flag) and the user's stored
 * `personalization.location` from the request, and delegates formatting to
 * `formatLocationToolResult`. Gracefully reports when disabled or not shared.
 */
class GetLocation extends Tool {
  constructor(fields = {}) {
    super();

    /** @type {boolean} Used to initialize the Tool without request context. */
    this.override = fields.override ?? false;
    this.req = fields.req;
    this.userId = fields.userId;

    this.name = 'get_location';
    this.description =
      "Returns the user's current location (place, coordinates, timezone) when they have shared it. Use it to tailor language, regional context, units, or weather lookups.";
    this.schema = locationSchema;
  }

  async _call() {
    const featureEnabled = this.req?.config?.location?.enabled !== false;
    const location = this.req?.user?.personalization?.location;
    return formatLocationToolResult(location, { featureEnabled });
  }
}

module.exports = GetLocation;
