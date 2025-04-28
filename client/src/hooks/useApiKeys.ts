import { useEffect, useCallback } from 'react';
import { useCreateApiKeyMutation } from '../data-provider';

// useApiKeys exposes api keys interface to be accessible
// in the console.
// Usage example:
// `window.ApiKey.create({ name: "My API Key" })`
export const useApiKeys = (): void => {
  const mutation = useCreateApiKeyMutation();

  const createApiKey = useCallback(
    async (payload?: { name: string }) => {
      if (!payload) {
        throw new Error('Payload is missing');
      }

      const { name } = payload;
      if (!name || name.length === 0) {
        throw new Error('Key name is required');
      }

      try {
        return await mutation.mutateAsync({ name });
      } catch (error) {
        throw new Error(`Error creating API Key: ${error}`);
      }
    },
    [mutation],
  );

  useEffect(() => {
    // @ts-ignore-next-line
    window.ApiKey = {
      create: async (payload?: { name: string }) => {
        try {
          const apiKey = await createApiKey(payload);
          console.log('API Key created:', apiKey);
        } catch (error) {
          console.error('Error creating API Key:', error);
          console.log('Usage example: window.ApiKey.create({ name: "My API Key" })');
        }
      },
    };
  }, [createApiKey]);
};
