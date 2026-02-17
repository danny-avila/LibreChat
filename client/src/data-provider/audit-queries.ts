/**
 * React Query Hooks for Audit API
 * Provides hooks with caching, invalidation, and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { AuditFilters, EditReportRequest, ApprovalRequest } from '~/types/audit';
import * as auditApi from './audit';

/**
 * Query keys for audit data
 * Structured for easy invalidation and caching
 */
export const auditKeys = {
  all: ['audits'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (filters?: AuditFilters) => [...auditKeys.lists(), filters] as const,
  details: () => [...auditKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditKeys.details(), id] as const,
  users: () => [...auditKeys.all, 'users'] as const,
  userList: (search?: string) => [...auditKeys.users(), search] as const,
  health: () => [...auditKeys.all, 'health'] as const,
};

/**
 * Hook to fetch audit list with filters
 * Always fetches fresh data (staleTime: 0)
 *
 * @param filters - Query filters
 * @param options - React Query options
 *
 * @example
 * const { data, isLoading, error, refetch } = useAuditList({
 *   approved: false,
 *   limit: 20
 * });
 */
export const useAuditList = (
  filters?: AuditFilters,
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => auditApi.listAudits(filters),
    staleTime: 30000,
    ...options,
  });
};

/**
 * Hook to fetch audit details
 * Always fetches fresh data
 *
 * @param sessionId - Audit session ID
 * @param options - React Query options
 *
 * @example
 * const { data: audit, isLoading } = useAuditDetails('session_123');
 * console.log(audit?.report);
 */
export const useAuditDetails = (
  sessionId: string,
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: auditKeys.detail(sessionId),
    queryFn: () => auditApi.getAuditDetails(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  });
};

/**
 * Hook to edit report
 * Automatically invalidates audit detail and list queries
 *
 * @example
 * const editMutation = useEditReport();
 *
 * const handleSave = () => {
 *   editMutation.mutate({
 *     sessionId: 'session_123',
 *     reportData: {
 *       executiveSummary: 'Updated...',
 *       changeNotes: 'Fixed typos'
 *     }
 *   });
 * };
 */
export const useEditReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, reportData }: { sessionId: string; reportData: EditReportRequest }) =>
      auditApi.editReport(sessionId, reportData),
    onSuccess: (data, variables) => {
      // Invalidate audit detail query to refetch updated data
      queryClient.invalidateQueries({ queryKey: auditKeys.detail(variables.sessionId) });

      // Invalidate all audit lists to show updated data
      queryClient.invalidateQueries({ queryKey: auditKeys.lists() });
    },
    onError: (error) => {
      console.error('[useEditReport] Failed to edit report:', error);
    },
  });
};

/**
 * Hook to approve report
 * Automatically invalidates audit detail and list queries
 *
 * @example
 * const approveMutation = useApproveReport();
 *
 * const handleApprove = () => {
 *   approveMutation.mutate({
 *     sessionId: 'session_123',
 *     data: {
 *       message: 'Great work!'
 *     }
 *   }, {
 *     onSuccess: (response) => {
 *       if (response.emailSent) {
 *         toast.success('Report approved and email sent!');
 *       }
 *     }
 *   });
 * };
 */
export const useApproveReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data?: ApprovalRequest }) =>
      auditApi.approveReport(sessionId, data),
    onSuccess: (response, variables) => {
      // Invalidate audit detail query
      queryClient.invalidateQueries({ queryKey: auditKeys.detail(variables.sessionId) });

      // Invalidate all audit lists
      queryClient.invalidateQueries({ queryKey: auditKeys.lists() });

      console.log('[useApproveReport] Report approved:', {
        sessionId: variables.sessionId,
        emailSent: response.emailSent,
      });
    },
    onError: (error) => {
      console.error('[useApproveReport] Failed to approve report:', error);
    },
  });
};

/**
 * Hook to fetch users with search
 *
 * @param search - Search string
 * @param options - React Query options
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const { data: users, isLoading } = useUserList(searchTerm);
 */
export const useUserList = (
  search?: string,
  options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: auditKeys.userList(search),
    queryFn: () => auditApi.listUsers(search),
    staleTime: 0,
    refetchOnMount: 'always',
    ...options,
  });
};

/**
 * Hook to check audit API health
 *
 * @example
 * const { data: health } = useAuditHealth();
 * if (!health?.healthy) {
 *   return <Alert>Audit API is unavailable</Alert>;
 * }
 */
export const useAuditHealth = (options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) => {
  return useQuery({
    queryKey: auditKeys.health(),
    queryFn: () => auditApi.healthCheck(),
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000, // Refetch every minute
    retry: 1, // Only retry once
    ...options,
  });
};

/**
 * Hook to manually invalidate audit queries
 * Useful for refetch after external updates
 *
 * @example
 * const invalidateAudits = useInvalidateAudits();
 *
 * const handleExternalUpdate = () => {
 *   invalidateAudits.all();
 * };
 */
export const useInvalidateAudits = () => {
  const queryClient = useQueryClient();

  return {
    all: () => queryClient.invalidateQueries({ queryKey: auditKeys.all }),
    lists: () => queryClient.invalidateQueries({ queryKey: auditKeys.lists() }),
    detail: (sessionId: string) =>
      queryClient.invalidateQueries({ queryKey: auditKeys.detail(sessionId) }),
    users: () => queryClient.invalidateQueries({ queryKey: auditKeys.users() }),
  };
};
