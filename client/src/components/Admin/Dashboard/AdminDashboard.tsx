import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, Pause, Play, AlertCircle, Menu } from 'lucide-react';
import { Button } from '@librechat/client';
import { cn } from '~/utils';
import type { TimeRange } from '~/types/admin';
import type { ContextType } from '~/common';
import {
  fetchOverviewMetrics,
  fetchUserMetrics,
  fetchConversationMetrics,
  fetchTokenMetrics,
  fetchMessageMetrics,
  fetchModelUsageMetrics,
  fetchBalanceMetrics,
  fetchErrorMetrics,
  fetchFileUploadMetrics,
  fetchUserEngagementMetrics,
  fetchEndpointPerformanceMetrics,
  fetchConversationQualityMetrics,
  getPresetTimeRange,
} from '~/data-provider/admin';

// Import child components
import MetricCard from './MetricCard';
import TimeRangeSelector from './TimeRangeSelector';
import { UserGrowthChart } from './UserGrowthChart';
import { TokenUsageChart } from './TokenUsageChart';
import { ConversationActivityChart } from './ConversationActivityChart';
import { EndpointDistributionChart } from './EndpointDistributionChart';
import TopUsersTable from './TopUsersTable';
import LiveDataSection from './LiveDataSection';

/**
 * AdminDashboard - Main container component for the Admin Reporting Dashboard
 * 
 * This component manages the state and data fetching for all dashboard metrics.
 * It provides:
 * - Overview metrics (users, conversations, messages, tokens, system health)
 * - User analytics with charts and tables
 * - Conversation analytics with visualizations
 * - Token usage and cost analytics
 * - Message analytics
 * - Time range filtering
 * - Real-time updates with auto-refresh
 * 
 * Requirements: All UI requirements (1.1-12.5)
 */
const AdminDashboard: React.FC = () => {
  // Get sidebar toggle from outlet context
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();

  // ============================================================================
  // State Management
  // ============================================================================

  // Time range state - defaults to last 30 days
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    const dates = getPresetTimeRange('last30days');
    return {
      start: new Date(dates.startDate),
      end: new Date(dates.endDate),
      preset: 'last30days',
    };
  });

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // ============================================================================
  // Data Fetching with React Query
  // ============================================================================

  // Convert time range to API params
  const getTimeRangeParams = useCallback(() => {
    return {
      startDate: timeRange.start.toISOString(),
      endDate: timeRange.end.toISOString(),
      preset: timeRange.preset,
    };
  }, [timeRange]);

  // Overview metrics query
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery(
    ['admin-overview'],
    fetchOverviewMetrics,
    {
      refetchInterval: autoRefresh ? 30000 : false, // 30 seconds
      onSuccess: () => setLastUpdate(new Date()),
    },
  );

  // User metrics query
  const {
    data: userMetrics,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUsers,
  } = useQuery(
    ['admin-users', getTimeRangeParams()],
    () => fetchUserMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Conversation metrics query
  const {
    data: conversationMetrics,
    isLoading: conversationLoading,
    error: conversationError,
    refetch: refetchConversations,
  } = useQuery(
    ['admin-conversations', getTimeRangeParams()],
    () => fetchConversationMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Token metrics query
  const {
    data: tokenMetrics,
    isLoading: tokenLoading,
    error: tokenError,
    refetch: refetchTokens,
  } = useQuery(
    ['admin-tokens', getTimeRangeParams()],
    () => fetchTokenMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Message metrics query
  const {
    data: messageMetrics,
    isLoading: messageLoading,
    error: messageError,
    refetch: refetchMessages,
  } = useQuery(
    ['admin-messages', getTimeRangeParams()],
    () => fetchMessageMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Model usage metrics query
  const {
    data: modelMetrics,
    isLoading: modelLoading,
    error: modelError,
    refetch: refetchModels,
  } = useQuery(
    ['admin-models', getTimeRangeParams()],
    () => fetchModelUsageMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Balance metrics query
  const {
    data: balanceMetrics,
    isLoading: balanceLoading,
    error: balanceError,
    refetch: refetchBalance,
  } = useQuery(
    ['admin-balance', getTimeRangeParams()],
    () => fetchBalanceMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Error metrics query
  const {
    data: errorMetrics,
    isLoading: errorLoading,
    error: errorError,
    refetch: refetchErrors,
  } = useQuery(
    ['admin-errors', getTimeRangeParams()],
    () => fetchErrorMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // File upload metrics query
  const {
    data: fileMetrics,
    isLoading: fileLoading,
    error: fileError,
    refetch: refetchFiles,
  } = useQuery(
    ['admin-files', getTimeRangeParams()],
    () => fetchFileUploadMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // User engagement metrics query
  const {
    data: engagementMetrics,
    isLoading: engagementLoading,
    error: engagementError,
    refetch: refetchEngagement,
  } = useQuery(
    ['admin-engagement', getTimeRangeParams()],
    () => fetchUserEngagementMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Endpoint performance metrics query
  const {
    data: endpointMetrics,
    isLoading: endpointLoading,
    error: endpointError,
    refetch: refetchEndpoints,
  } = useQuery(
    ['admin-endpoints', getTimeRangeParams()],
    () => fetchEndpointPerformanceMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // Conversation quality metrics query
  const {
    data: qualityMetrics,
    isLoading: qualityLoading,
    error: qualityError,
    refetch: refetchQuality,
  } = useQuery(
    ['admin-quality', getTimeRangeParams()],
    () => fetchConversationQualityMetrics(getTimeRangeParams()),
    {
      refetchInterval: autoRefresh ? 30000 : false,
    },
  );

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // Handle time range change
  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
  };

  // Handle manual refresh
  const handleManualRefresh = () => {
    refetchOverview();
    refetchUsers();
    refetchConversations();
    refetchTokens();
    refetchMessages();
    refetchModels();
    refetchBalance();
    refetchErrors();
    refetchFiles();
    refetchEngagement();
    refetchEndpoints();
    refetchQuality();
    setLastUpdate(new Date());
  };

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  // ============================================================================
  // Error Handling
  // ============================================================================

  const hasError = overviewError || userError || conversationError || tokenError || messageError || 
    modelError || balanceError || errorError || fileError || engagementError || endpointError || qualityError;
  const isLoading = overviewLoading || userLoading || conversationLoading || tokenLoading || messageLoading ||
    modelLoading || balanceLoading || errorLoading || fileLoading || engagementLoading || endpointLoading || qualityLoading;

  if (hasError) {
    const errorMessage = (hasError as Error).message || 'Failed to load dashboard data';
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-primary p-4">
        <div className="max-w-md rounded-lg border border-border-light bg-surface-secondary p-6 text-center shadow-lg">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-text-primary">Error Loading Dashboard</h2>
          <p className="mb-4 text-text-secondary">{errorMessage}</p>
          <Button onClick={handleManualRefresh} variant="default">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface-primary">
      <div className="w-full py-4 px-4 md:py-6 md:px-6 lg:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              {/* Sidebar Toggle Button */}
              {!navVisible && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNavVisible(true)}
                  className="gap-2"
                  title="Show sidebar"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
              <div>
                <h1 className="text-3xl font-bold text-text-primary">Admin Dashboard</h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Monitor system usage, user activity, and performance metrics
                </p>
              </div>
            </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Last Update Timestamp */}
            <div className="text-sm text-text-secondary">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>

            {/* Auto-refresh Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAutoRefresh}
              className="gap-2"
            >
              {autoRefresh ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause Updates
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Resume Updates
                </>
              )}
            </Button>

            {/* Manual Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>

          </div>
        </div>

        {/* Time Range Selector */}
        <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Time Range</h3>
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            presets={['today', 'last7days', 'last30days', 'last90days']}
          />
        </div>

        {/* Live Data Section - Real-time activity */}
        <LiveDataSection autoRefresh={autoRefresh} />

        {/* Overview Section - Requirements: 1.1, 2.1, 3.1, 4.1, 10.1, 10.2 */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Users */}
            <MetricCard
              title="Total Users"
              value={overviewData?.users.total ?? 0}
              change={overviewData?.users.newThisMonth}
              changeType="increase"
              loading={overviewLoading}
            />

            {/* Total Conversations */}
            <MetricCard
              title="Total Conversations"
              value={overviewData?.conversations.total ?? 0}
              loading={overviewLoading}
            />

            {/* Total Messages */}
            <MetricCard
              title="Total Messages"
              value={overviewData?.messages.total ?? 0}
              change={overviewData?.messages.todayCount}
              changeType="neutral"
              loading={overviewLoading}
            />

            {/* Total Tokens */}
            <MetricCard
              title="Total Tokens"
              value={overviewData?.tokens.totalConsumed ?? 0}
              loading={overviewLoading}
            />
          </div>

          {/* System Health Indicators */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Avg Response Time"
              value={`${overviewData?.systemHealth.avgResponseTime ?? 0}ms`}
              loading={overviewLoading}
            />
            <MetricCard
              title="Error Rate"
              value={`${((overviewData?.systemHealth.errorRate ?? 0) * 100).toFixed(2)}%`}
              changeType={
                (overviewData?.systemHealth.errorRate ?? 0) > 0.05 ? 'decrease' : 'neutral'
              }
              loading={overviewLoading}
            />
            <MetricCard
              title="Cache Hit Rate"
              value={`${((overviewData?.systemHealth.cacheHitRate ?? 0) * 100).toFixed(1)}%`}
              changeType="increase"
              loading={overviewLoading}
            />
          </div>
        </section>

        {/* User Analytics Section - Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3 */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">User Analytics</h2>
          
          {/* User Metrics Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Active Users (Daily)"
              value={userMetrics?.activeUsers.daily ?? 0}
              loading={userLoading}
            />
            <MetricCard
              title="Active Users (Weekly)"
              value={userMetrics?.activeUsers.weekly ?? 0}
              loading={userLoading}
            />
            <MetricCard
              title="Active Users (Monthly)"
              value={userMetrics?.activeUsers.monthly ?? 0}
              loading={userLoading}
            />
            <MetricCard
              title="Total Users"
              value={userMetrics?.totalUsers ?? 0}
              loading={userLoading}
            />
          </div>

          {/* User Growth Chart */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">User Growth</h3>
            <UserGrowthChart
              data={userMetrics?.newUsers ?? []}
              loading={userLoading}
              granularity="daily"
            />
          </div>

          {/* Auth Method Breakdown */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Authentication Methods
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {userMetrics?.authMethodBreakdown
                ? Object.entries(userMetrics.authMethodBreakdown)
                    .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
                    .map(([provider, data]) => {
                      // Format provider name for display
                      const formatProviderName = (name: string): string => {
                        const nameMap: Record<string, string> = {
                          local: 'Email',
                          email: 'Email',
                          google: 'Google',
                          github: 'GitHub',
                          openid: 'OpenID',
                          saml: 'SAML',
                          ldap: 'LDAP',
                          facebook: 'Facebook',
                          discord: 'Discord',
                          apple: 'Apple',
                          unknown: 'Other',
                        };
                        return (
                          nameMap[name.toLowerCase()] ||
                          name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
                        );
                      };

                      return (
                        <MetricCard
                          key={provider}
                          title={formatProviderName(provider)}
                          value={data.count ?? 0}
                          loading={userLoading}
                        />
                      );
                    })
                : [
                    <MetricCard key="email" title="Email" value={0} loading={userLoading} />,
                    <MetricCard key="google" title="Google" value={0} loading={userLoading} />,
                    <MetricCard key="github" title="GitHub" value={0} loading={userLoading} />,
                    <MetricCard key="other" title="Other" value={0} loading={userLoading} />,
                  ]}
            </div>
          </div>

          {/* Top Users Table */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Top Users</h3>
            <TopUsersTable
              users={userMetrics?.topUsers ?? []}
              metric="conversations"
              loading={userLoading}
            />
          </div>
        </section>

        {/* Conversation Analytics Section - Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">
            Conversation Analytics
          </h2>

          {/* Conversation Metrics Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Conversations"
              value={conversationMetrics?.totalConversations ?? 0}
              loading={conversationLoading}
            />
            <MetricCard
              title="Avg Messages/Conv"
              value={conversationMetrics?.averageMessagesPerConversation.toFixed(1) ?? '0'}
              loading={conversationLoading}
            />
            <MetricCard
              title="Archived"
              value={conversationMetrics?.archivedCount ?? 0}
              loading={conversationLoading}
            />
            <MetricCard
              title="Active"
              value={
                (conversationMetrics?.totalConversations ?? 0) -
                (conversationMetrics?.archivedCount ?? 0)
              }
              loading={conversationLoading}
            />
          </div>

          {/* Conversation Activity Chart */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Conversation Activity
            </h3>
            <ConversationActivityChart
              data={conversationMetrics?.conversationsByPeriod ?? []}
              loading={conversationLoading}
              granularity="daily"
            />
          </div>

          {/* Endpoint Distribution */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Endpoint Distribution
            </h3>
            <EndpointDistributionChart
              data={conversationMetrics?.conversationsByEndpoint ?? []}
              loading={conversationLoading}
            />
          </div>

          {/* Conversation Length Distribution */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Conversation Length Distribution
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                title="Short (1-5 msgs)"
                value={conversationMetrics?.conversationLengthDistribution.short ?? 0}
                loading={conversationLoading}
              />
              <MetricCard
                title="Medium (6-20 msgs)"
                value={conversationMetrics?.conversationLengthDistribution.medium ?? 0}
                loading={conversationLoading}
              />
              <MetricCard
                title="Long (21+ msgs)"
                value={conversationMetrics?.conversationLengthDistribution.long ?? 0}
                loading={conversationLoading}
              />
            </div>
          </div>
        </section>

        {/* Token Analytics Section - Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Token Analytics</h2>

          {/* Token Metrics Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Tokens"
              value={tokenMetrics?.totalTokens ?? 0}
              loading={tokenLoading}
            />
            <MetricCard
              title="Prompt Tokens"
              value={tokenMetrics?.promptTokens ?? 0}
              loading={tokenLoading}
            />
            <MetricCard
              title="Completion Tokens"
              value={tokenMetrics?.completionTokens ?? 0}
              loading={tokenLoading}
            />
            <MetricCard
              title="Estimated Cost"
              value={`$${(tokenMetrics?.estimatedCosts.total ?? 0).toFixed(2)}`}
              loading={tokenLoading}
            />
          </div>

          {/* Token Usage Chart */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Token Usage by Endpoint
            </h3>
            <TokenUsageChart
              data={tokenMetrics?.tokensByEndpoint ?? []}
              loading={tokenLoading}
            />
          </div>

          {/* Balance Statistics */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Balance Statistics</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                title="Total Credits"
                value={tokenMetrics?.balanceStats.totalCredits ?? 0}
                loading={tokenLoading}
              />
              <MetricCard
                title="Avg Balance"
                value={(tokenMetrics?.balanceStats.averageBalance ?? 0).toFixed(2)}
                loading={tokenLoading}
              />
              <MetricCard
                title="Low Balance Users"
                value={tokenMetrics?.balanceStats.usersWithLowBalance ?? 0}
                loading={tokenLoading}
              />
            </div>
          </div>

          {/* Cache Statistics */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Cache Statistics</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <MetricCard
                title="Write Tokens"
                value={tokenMetrics?.cacheStats.writeTokens ?? 0}
                loading={tokenLoading}
              />
              <MetricCard
                title="Read Tokens"
                value={tokenMetrics?.cacheStats.readTokens ?? 0}
                loading={tokenLoading}
              />
              <MetricCard
                title="Hit Rate"
                value={`${((tokenMetrics?.cacheStats.hitRate ?? 0) * 100).toFixed(1)}%`}
                loading={tokenLoading}
              />
              <MetricCard
                title="Savings"
                value={`$${(tokenMetrics?.cacheStats.savings ?? 0).toFixed(2)}`}
                loading={tokenLoading}
              />
            </div>
          </div>
        </section>

        {/* Message Analytics Section - Requirements: 4.1, 4.2, 4.3, 4.4, 4.5 */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Message Analytics</h2>

          {/* Message Metrics Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Messages"
              value={messageMetrics?.totalMessages ?? 0}
              loading={messageLoading}
            />
            <MetricCard
              title="User Generated"
              value={messageMetrics?.userGeneratedCount ?? 0}
              loading={messageLoading}
            />
            <MetricCard
              title="AI Generated"
              value={messageMetrics?.aiGeneratedCount ?? 0}
              loading={messageLoading}
            />
            <MetricCard
              title="Error Rate"
              value={`${((messageMetrics?.errorRate ?? 0) * 100).toFixed(2)}%`}
              changeType={(messageMetrics?.errorRate ?? 0) > 0.05 ? 'decrease' : 'neutral'}
              loading={messageLoading}
            />
          </div>

          {/* Message Activity Chart */}
          <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Message Activity</h3>
            <ConversationActivityChart
              data={messageMetrics?.messagesByPeriod ?? []}
              loading={messageLoading}
              granularity="daily"
            />
          </div>

          {/* Message Type Breakdown */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              Message Type Breakdown
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                title="User Messages"
                value={messageMetrics?.userGeneratedCount ?? 0}
                loading={messageLoading}
              />
              <MetricCard
                title="AI Messages"
                value={messageMetrics?.aiGeneratedCount ?? 0}
                loading={messageLoading}
              />
              <MetricCard
                title="Error Messages"
                value={messageMetrics?.errorCount ?? 0}
                loading={messageLoading}
              />
            </div>
          </div>
        </section>

        {/* Model Usage Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Model Usage Analytics</h2>

          {/* Model Distribution Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modelMetrics?.modelDistribution?.slice(0, 4).map((model: any) => (
              <MetricCard
                key={model.model}
                title={model.model || 'Unknown'}
                value={model.tokens?.toLocaleString() ?? 0}
                change={model.percentage?.toFixed(1)}
                changeType="neutral"
                loading={modelLoading}
              />
            ))}
          </div>

          {/* Model Trends Chart */}
          {modelMetrics?.modelTrends && modelMetrics.modelTrends.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Model Usage Trends</h3>
              <ConversationActivityChart
                data={modelMetrics.modelTrends
                  .filter((item: any) => item && item.date)
                  .map((item: any) => ({
                    timestamp: new Date(item.date),
                    value: item.tokens ?? 0,
                  }))}
                loading={modelLoading}
                granularity="daily"
              />
            </div>
          )}

          {/* Average Tokens by Model */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Average Tokens per Conversation by Model</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modelMetrics?.avgTokensByModel?.slice(0, 6).map((model: any) => (
                <MetricCard
                  key={model.model}
                  title={model.model || 'Unknown'}
                  value={model.avgTokensPerConversation?.toFixed(0) ?? 0}
                  loading={modelLoading}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Balance & Credits Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Balance & Credits Analytics</h2>

          {/* Balance Stats Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Credits"
              value={balanceMetrics?.totalCredits?.toLocaleString() ?? 0}
              loading={balanceLoading}
            />
            <MetricCard
              title="Average Balance"
              value={balanceMetrics?.averageBalance?.toFixed(2) ?? 0}
              loading={balanceLoading}
            />
            <MetricCard
              title="Low Balance Users"
              value={balanceMetrics?.lowBalanceUsers ?? 0}
              loading={balanceLoading}
            />
            <MetricCard
              title="Credits Distributed"
              value={balanceMetrics?.totalCreditsDistributed?.toLocaleString() ?? 0}
              loading={balanceLoading}
            />
          </div>

          {/* Balance Distribution */}
          {balanceMetrics?.balanceDistribution && balanceMetrics.balanceDistribution.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Balance Distribution</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {balanceMetrics.balanceDistribution.map((range: any) => (
                  <MetricCard
                    key={range.range}
                    title={range.range}
                    value={range.count ?? 0}
                    loading={balanceLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Credit Refill Activity */}
          {balanceMetrics?.creditRefillActivity && balanceMetrics.creditRefillActivity.length > 0 && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Credit Refill Activity</h3>
              <ConversationActivityChart
                data={balanceMetrics.creditRefillActivity
                  .filter((item: any) => item && item.date)
                  .map((item: any) => ({
                    timestamp: new Date(item.date),
                    value: item.totalCredits ?? 0,
                  }))}
                loading={balanceLoading}
                granularity="daily"
              />
            </div>
          )}
        </section>

        {/* Error & Failure Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Error & Failure Analytics</h2>

          {/* Error Stats Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Messages"
              value={errorMetrics?.totalMessages?.toLocaleString() ?? 0}
              loading={errorLoading}
            />
            <MetricCard
              title="Error Messages"
              value={errorMetrics?.errorMessages?.toLocaleString() ?? 0}
              loading={errorLoading}
            />
            <MetricCard
              title="Error Rate"
              value={`${((errorMetrics?.errorRate ?? 0) * 100).toFixed(2)}%`}
              changeType={(errorMetrics?.errorRate ?? 0) > 0.05 ? 'decrease' : 'neutral'}
              loading={errorLoading}
            />
            <MetricCard
              title="Success Rate"
              value={`${(100 - ((errorMetrics?.errorRate ?? 0) * 100)).toFixed(2)}%`}
              changeType={(errorMetrics?.errorRate ?? 0) < 0.05 ? 'increase' : 'neutral'}
              loading={errorLoading}
            />
          </div>

          {/* Errors by Endpoint */}
          {errorMetrics?.errorsByEndpoint && errorMetrics.errorsByEndpoint.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Errors by Endpoint</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {errorMetrics.errorsByEndpoint.slice(0, 8).map((endpoint: any) => (
                  <MetricCard
                    key={endpoint.endpoint}
                    title={endpoint.endpoint || 'Unknown'}
                    value={endpoint.errorCount ?? 0}
                    loading={errorLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error Trends */}
          {errorMetrics?.errorTrends && errorMetrics.errorTrends.length > 0 && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Error Trends</h3>
              <ConversationActivityChart
                data={errorMetrics.errorTrends
                  .filter((item: any) => item && item.date)
                  .map((item: any) => ({
                    timestamp: new Date(item.date),
                    value: item.errorCount ?? 0,
                  }))}
                loading={errorLoading}
                granularity="daily"
              />
            </div>
          )}
        </section>

        {/* File Upload Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">File Upload Analytics</h2>

          {/* File Stats Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Files"
              value={fileMetrics?.totalFiles?.toLocaleString() ?? 0}
              loading={fileLoading}
            />
            <MetricCard
              title="Total Storage"
              value={fileMetrics?.totalStorageGB ? `${fileMetrics.totalStorageGB.toFixed(2)} GB` : '0 GB'}
              loading={fileLoading}
            />
            <MetricCard
              title="Storage (MB)"
              value={fileMetrics?.totalStorageMB?.toFixed(2) ?? 0}
              loading={fileLoading}
            />
            <MetricCard
              title="Avg File Size"
              value={fileMetrics?.totalFiles > 0 
                ? `${(fileMetrics.totalStorageMB / fileMetrics.totalFiles).toFixed(2)} MB`
                : '0 MB'}
              loading={fileLoading}
            />
          </div>

          {/* Files by Type */}
          {fileMetrics?.filesByType && fileMetrics.filesByType.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Files by Type</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {fileMetrics.filesByType.slice(0, 8).map((type: any) => (
                  <MetricCard
                    key={type.type}
                    title={type.type || 'Unknown'}
                    value={type.count ?? 0}
                    loading={fileLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upload Activity */}
          {fileMetrics?.uploadActivity && fileMetrics.uploadActivity.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Upload Activity</h3>
              <ConversationActivityChart
                data={fileMetrics.uploadActivity
                  .filter((item: any) => item && item.date)
                  .map((item: any) => ({
                    timestamp: new Date(item.date),
                    value: item.fileCount ?? 0,
                  }))}
                loading={fileLoading}
                granularity="daily"
              />
            </div>
          )}

          {/* Top Users by Files */}
          {fileMetrics?.topUsersByFiles && fileMetrics.topUsersByFiles.length > 0 && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Top Users by File Uploads</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="px-4 py-2 text-left text-sm font-semibold text-text-primary">User</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Files</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Total Size (MB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileMetrics.topUsersByFiles.slice(0, 10).map((user: any) => (
                      <tr key={user.userId} className="border-b border-border-light">
                        <td className="px-4 py-2 text-sm text-text-primary">{user.email || 'Unknown'}</td>
                        <td className="px-4 py-2 text-right text-sm text-text-secondary">{user.fileCount ?? 0}</td>
                        <td className="px-4 py-2 text-right text-sm text-text-secondary">
                          {user.totalSizeMB?.toFixed(2) ?? '0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* User Engagement Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">User Engagement Analytics</h2>

          {/* Engagement Stats Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Retention Rate"
              value={`${(engagementMetrics?.retentionRate ?? 0).toFixed(2)}%`}
              changeType={(engagementMetrics?.retentionRate ?? 0) > 50 ? 'increase' : 'neutral'}
              loading={engagementLoading}
            />
            <MetricCard
              title="Avg Session Length"
              value={`${(engagementMetrics?.avgSessionLength ?? 0).toFixed(1)} min`}
              loading={engagementLoading}
            />
            <MetricCard
              title="Avg Days Between Sessions"
              value={(engagementMetrics?.avgDaysBetweenSessions ?? 0).toFixed(1)}
              loading={engagementLoading}
            />
            <MetricCard
              title="Churn Rate"
              value={`${(engagementMetrics?.churnRate ?? 0).toFixed(2)}%`}
              changeType={(engagementMetrics?.churnRate ?? 0) > 20 ? 'decrease' : 'neutral'}
              loading={engagementLoading}
            />
          </div>

          {/* User Stats */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Total Users"
              value={engagementMetrics?.totalUsers?.toLocaleString() ?? 0}
              loading={engagementLoading}
            />
            <MetricCard
              title="Active Users (30d)"
              value={engagementMetrics?.activeUsers?.toLocaleString() ?? 0}
              loading={engagementLoading}
            />
            <MetricCard
              title="Churned Users"
              value={engagementMetrics?.churnedUsers?.toLocaleString() ?? 0}
              loading={engagementLoading}
            />
          </div>

          {/* Power Users */}
          {engagementMetrics?.powerUsers && engagementMetrics.powerUsers.length > 0 && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Power Users</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="px-4 py-2 text-left text-sm font-semibold text-text-primary">User</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Conversations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagementMetrics.powerUsers.map((user: any) => (
                      <tr key={user.userId} className="border-b border-border-light">
                        <td className="px-4 py-2 text-sm text-text-primary">{user.email || 'Unknown'}</td>
                        <td className="px-4 py-2 text-right text-sm text-text-secondary">
                          {user.conversationCount ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Endpoint Performance Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Endpoint Performance Analytics</h2>

          {/* Endpoint Performance Table */}
          {endpointMetrics?.endpointPerformance && endpointMetrics.endpointPerformance.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Endpoint Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-light">
                      <th className="px-4 py-2 text-left text-sm font-semibold text-text-primary">Endpoint</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Conversations</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Avg Response (s)</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Error Rate</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-text-primary">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpointMetrics.endpointPerformance.map((endpoint: any) => (
                      <tr key={endpoint.endpoint} className="border-b border-border-light">
                        <td className="px-4 py-2 text-sm text-text-primary">{endpoint.endpoint || 'Unknown'}</td>
                        <td className="px-4 py-2 text-right text-sm text-text-secondary">
                          {endpoint.conversationCount?.toLocaleString() ?? 0}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-text-secondary">
                          {endpoint.avgResponseTime?.toFixed(2) ?? '0.00'}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-red-600">
                          {endpoint.errorRate?.toFixed(2) ?? '0.00'}%
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-green-600">
                          {endpoint.successRate?.toFixed(2) ?? '100.00'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Endpoint Trends */}
          {endpointMetrics?.endpointTrends && endpointMetrics.endpointTrends.length > 0 && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Endpoint Popularity Trends</h3>
              <ConversationActivityChart
                data={endpointMetrics.endpointTrends
                  .filter((item: any) => item && item.date)
                  .map((item: any) => ({
                    timestamp: new Date(item.date),
                    value: item.count ?? 0,
                  }))}
                loading={endpointLoading}
                granularity="daily"
              />
            </div>
          )}
        </section>

        {/* Conversation Quality Analytics Section */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-text-primary">Conversation Quality Analytics</h2>

          {/* Quality Stats Cards */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Conversations"
              value={qualityMetrics?.totalConversations?.toLocaleString() ?? 0}
              loading={qualityLoading}
            />
            <MetricCard
              title="Avg Duration"
              value={`${(qualityMetrics?.avgDuration ?? 0).toFixed(1)} min`}
              loading={qualityLoading}
            />
            <MetricCard
              title="Completion Rate"
              value={`${(qualityMetrics?.completionRate ?? 0).toFixed(2)}%`}
              changeType={(qualityMetrics?.completionRate ?? 0) > 70 ? 'increase' : 'neutral'}
              loading={qualityLoading}
            />
            <MetricCard
              title="Abandonment Rate"
              value={`${(qualityMetrics?.abandonmentRate ?? 0).toFixed(2)}%`}
              changeType={(qualityMetrics?.abandonmentRate ?? 0) > 30 ? 'decrease' : 'neutral'}
              loading={qualityLoading}
            />
          </div>

          {/* Completion Stats */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard
              title="Completed Conversations"
              value={qualityMetrics?.completedConversations?.toLocaleString() ?? 0}
              loading={qualityLoading}
            />
            <MetricCard
              title="Abandoned Conversations"
              value={qualityMetrics?.abandonedConversations?.toLocaleString() ?? 0}
              loading={qualityLoading}
            />
          </div>

          {/* Multi-Turn Breakdown */}
          {qualityMetrics?.multiTurnBreakdown && qualityMetrics.multiTurnBreakdown.length > 0 && (
            <div className="mb-4 rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Conversation Length Distribution</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                {qualityMetrics.multiTurnBreakdown.map((category: any) => (
                  <MetricCard
                    key={category.category}
                    title={
                      category.category === 'very-long'
                        ? 'Very Long (20+)'
                        : category.category === 'long'
                          ? 'Long (10-19)'
                          : category.category === 'medium'
                            ? 'Medium (5-9)'
                            : 'Short (<5)'
                    }
                    value={category.count ?? 0}
                    loading={qualityLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Average Messages */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Average Messages per Conversation</h3>
            <MetricCard
              title="Avg Messages"
              value={(qualityMetrics?.avgMessagesPerConversation ?? 0).toFixed(1)}
              loading={qualityLoading}
            />
          </div>
        </section>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
