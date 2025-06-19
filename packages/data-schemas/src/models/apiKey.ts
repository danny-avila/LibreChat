import apiKeySchema, { IApiKey } from '~/schema/apiKey';

/**
 * Creates or returns the ApiKey model using the provided mongoose instance and schema
 */
export function createApiKeyModel(mongoose: typeof import('mongoose')) {
  // Note: Changed model name to 'ApiKey' for consistency, was 'Key'
  return mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', apiKeySchema);
}
