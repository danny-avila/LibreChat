import providerSchema, { IProvider } from '~/schema/provider';

/**
 * Creates or returns the Provider model using the provided mongoose instance and schema
 */
export function createProviderModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Provider || mongoose.model<IProvider>('Provider', providerSchema);
}
