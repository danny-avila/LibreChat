import { useState, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useToastContext } from '@librechat/client';
import { request } from 'librechat-data-provider';

interface SocialAccount {
  _id: string;
  userId: string;
  platform: string;
  postizIntegrationId: string;
  accountName: string;
  accountId?: string;
  isActive: boolean;
  metadata?: {
    type?: string;
    picture?: string;
    providerAccountId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Platform {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface ConnectionStatus {
  [key: string]: SocialAccount | null;
}

/**
 * Hook for managing social media account connections
 */
export function useSocialAccounts() {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  // Fetch connected accounts
  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: async () => {
      console.log('[useSocialAccounts] Fetching accounts...');
      const data = await request.get('/api/social/accounts');
      console.log('[useSocialAccounts] Accounts fetched:', data);
      return data;
    },
  });

  // Fetch connection status
  const {
    data: statusData,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['socialStatus'],
    queryFn: async () => {
      console.log('[useSocialAccounts] Fetching status...');
      const data = await request.get('/api/social/status');
      console.log('[useSocialAccounts] Status fetched:', data);
      return data;
    },
  });

  // Fetch supported platforms
  const { 
    data: platformsData,
    isLoading: isLoadingPlatforms,
    error: platformsError,
  } = useQuery({
    queryKey: ['socialPlatforms'],
    queryFn: async () => {
      console.log('[useSocialAccounts] Fetching platforms...');
      const data = await request.get('/api/social/platforms');
      console.log('[useSocialAccounts] Platforms fetched:', data);
      return data;
    },
  });

  // Connect account mutation
  const connectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const data = await request.post(`/api/social/connect/${platform}`, {});
      return data;
    },
    onSuccess: (data) => {
      // Redirect to OAuth URL
      if (data.oauthUrl) {
        window.location.href = data.oauthUrl;
      }
    },
    onError: (error: Error) => {
      showToast({
        message: error.message || 'Failed to connect account',
        status: 'error',
      });
      setConnectingPlatform(null);
    },
  });

  // Disconnect account mutation
  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const data = await request.delete(`/api/social/accounts/${accountId}`);
      return data;
    },
    onSuccess: (data) => {
      showToast({
        message: `${data.platform} account disconnected successfully`,
        status: 'success',
      });
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['socialAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['socialStatus'] });
    },
    onError: (error: Error) => {
      showToast({
        message: error.message || 'Failed to disconnect account',
        status: 'error',
      });
    },
  });

  // Connect account handler
  const connectAccount = useCallback(
    async (platform: string) => {
      setConnectingPlatform(platform);
      try {
        await connectMutation.mutateAsync(platform);
      } catch (error) {
        setConnectingPlatform(null);
      }
    },
    [connectMutation]
  );

  // Disconnect account handler
  const disconnectAccount = useCallback(
    async (accountId: string) => {
      if (confirm('Are you sure you want to disconnect this account?')) {
        await disconnectMutation.mutateAsync(accountId);
      }
    },
    [disconnectMutation]
  );

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async (postData: { content: string; integrationIds: string[] }) => {
      const data = await request.post('/api/social/posts', postData);
      return data;
    },
    onSuccess: (data) => {
      showToast({
        message: 'Post published successfully!',
        status: 'success',
      });
    },
    onError: (error: Error) => {
      showToast({
        message: error.message || 'Failed to create post',
        status: 'error',
      });
      throw error;
    },
  });

  // Create post handler
  const createPost = useCallback(
    async (postData: { content: string; integrationIds: string[] }) => {
      return await createPostMutation.mutateAsync(postData);
    },
    [createPostMutation]
  );

  // Refresh all data
  const refreshAccounts = useCallback(() => {
    refetchAccounts();
    refetchStatus();
  }, [refetchAccounts, refetchStatus]);

  return {
    // Data
    accounts: (accountsData?.accounts || []) as SocialAccount[],
    status: (statusData?.status || {}) as ConnectionStatus,
    platforms: (platformsData?.platforms || []) as Platform[],

    // Loading states
    isLoading: isLoadingAccounts || isLoadingStatus || isLoadingPlatforms,
    connectingPlatform,
    isDisconnecting: disconnectMutation.isLoading,
    isCreatingPost: createPostMutation.isLoading,

    // Error states
    error: accountsError || platformsError,

    // Actions
    connectAccount,
    disconnectAccount,
    createPost,
    refreshAccounts,
  };
}
