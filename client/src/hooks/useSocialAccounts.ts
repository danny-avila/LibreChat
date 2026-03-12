import { useState, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useToastContext } from '@librechat/client';
import { request } from 'librechat-data-provider';
import { useAuthContext } from './AuthContext';

interface SocialAccount {
  _id: string;
  userId: string;
  platform: string;
  accountName: string;
  accountId?: string;
  isActive: boolean;
  metadata?: {
    email?: string;
    picture?: string;
    givenName?: string;
    familyName?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook for managing social media account connections
 * Currently supports: LinkedIn (direct OAuth)
 * Coming soon: Facebook, X (Twitter), Instagram
 */
export function useSocialAccounts() {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const [loading, setLoading] = useState(false);

  // Fetch LinkedIn account status
  const {
    data: linkedinData,
    isLoading: isLoadingLinkedIn,
    refetch: refetchLinkedIn,
  } = useQuery({
    queryKey: ['linkedinAccount'],
    queryFn: async () => {
      const data = await request.get('/api/linkedin/status');
      return data;
    },
    enabled: !!token, // Only fetch when authenticated
  });

  // Create LinkedIn post mutation
  const createLinkedInPostMutation = useMutation({
    mutationFn: async (postData: { content: string; visibility?: string }) => {
      const data = await request.post('/api/linkedin/posts', postData);
      return data;
    },
    onSuccess: () => {
      showToast({
        message: 'Post published to LinkedIn successfully!',
        status: 'success',
      });
    },
    onError: (error: Error) => {
      showToast({
        message: error.message || 'Failed to publish to LinkedIn',
        status: 'error',
      });
      throw error;
    },
  });

  // Create post handler - routes to appropriate platform
  const createPost = useCallback(
    async (postData: { content: string; platforms: string[] }) => {
      const { content, platforms } = postData;
      
      // For now, only LinkedIn is supported
      if (platforms.includes('linkedin')) {
        return await createLinkedInPostMutation.mutateAsync({
          content,
          visibility: 'PUBLIC',
        });
      }
      
      throw new Error('No supported platforms selected');
    },
    [createLinkedInPostMutation]
  );

  // Build accounts array from connected platforms
  const accounts: SocialAccount[] = [];
  if (linkedinData?.connected && linkedinData?.account) {
    accounts.push({
      _id: 'linkedin',
      userId: '',
      platform: 'linkedin',
      accountName: linkedinData.account.accountName,
      accountId: linkedinData.account.accountId,
      isActive: true,
      metadata: linkedinData.account.metadata,
      createdAt: linkedinData.account.connectedAt,
      updatedAt: linkedinData.account.connectedAt,
    });
  }

  // Refresh all data
  const refreshAccounts = useCallback(() => {
    refetchLinkedIn();
  }, [refetchLinkedIn]);

  return {
    // Data
    accounts,
    
    // Loading states
    loading: isLoadingLinkedIn || loading,
    isCreatingPost: createLinkedInPostMutation.isLoading,

    // Actions
    createPost,
    refreshAccounts,
  };
}
