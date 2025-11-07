import { useState } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';

interface N8nResponse {
  success: boolean;
  response: string;
  timestamp: string;
}

export const useN8nWebhook = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuthContext();

  const callN8nWebhook = async (text: string): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/n8n/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: N8nResponse = await response.json();
      
      if (!data.success) {
        throw new Error('n8n webhook call failed');
      }

      return data.response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return { callN8nWebhook, isLoading, error };
};