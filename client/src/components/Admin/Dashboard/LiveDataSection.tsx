import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Users, MessageSquare, Zap, AlertCircle, Clock } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { fetchLiveData } from '~/data-provider/admin';
import MetricCard from './MetricCard';

interface LiveDataSectionProps {
  autoRefresh?: boolean;
}

/**
 * LiveDataSection - Displays real-time/live system activity
 * Updates every 10 seconds to show current system state
 */
const LiveDataSection: React.FC<LiveDataSectionProps> = ({ autoRefresh = true }) => {
  const {
    data: liveData,
    isLoading,
    error,
  } = useQuery(
    ['admin-live'],
    fetchLiveData,
    {
      refetchInterval: autoRefresh ? 10000 : false, // Refresh every 10 seconds
    },
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load live data: {(error as Error).message}
        </p>
      </div>
    );
  }

  const formatTimeAgo = (timestamp: Date | string): string => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);

    if (diffSecs < 60) {
      return `${diffSecs}s ago`;
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else {
      return `${Math.floor(diffMins / 60)}h ago`;
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-green-500" />
        <h2 className="text-2xl font-semibold text-text-primary">Live Activity</h2>
        {liveData?.timestamp && (
          <span className="ml-auto text-xs text-text-secondary">
            Updated: {new Date(liveData.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Live Metrics Cards */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Sessions"
          value={liveData?.activeSessions?.count ?? 0}
          loading={isLoading}
          icon={<Users className="h-5 w-5" />}
        />
        <MetricCard
          title="Active Conversations"
          value={liveData?.activeConversations ?? 0}
          loading={isLoading}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <MetricCard
          title="Message Rate"
          value={`${(liveData?.messageRate ?? 0).toLocaleString()}/min`}
          loading={isLoading}
          icon={<Zap className="h-5 w-5" />}
        />
        <MetricCard
          title="Token Rate"
          value={`${(liveData?.tokenRate ?? 0).toLocaleString()}/min`}
          loading={isLoading}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Active Sessions List */}
        <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Users className="h-5 w-5" />
            Active Sessions ({liveData?.activeSessions?.count ?? 0})
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : liveData?.activeSessions?.users && liveData.activeSessions.users.length > 0 ? (
            <div className="space-y-2">
              {liveData.activeSessions.users.slice(0, 10).map((session: any) => (
                <div
                  key={session.userId}
                  className="flex items-center justify-between rounded border border-border-light bg-surface-primary p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {session.email || 'Unknown'}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {session.conversationCount} conversation{session.conversationCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(session.lastActivity)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-text-secondary">No active sessions</p>
          )}
        </div>

        {/* Active Endpoints & Recent Activity */}
        <div className="space-y-4">
          {/* Active Endpoints */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
              <Zap className="h-5 w-5" />
              Active Endpoints
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : liveData?.activeEndpoints && liveData.activeEndpoints.length > 0 ? (
              <div className="space-y-2">
                {liveData.activeEndpoints.map((endpoint: any) => (
                  <div
                    key={endpoint.endpoint}
                    className="flex items-center justify-between rounded border border-border-light bg-surface-primary p-2"
                  >
                    <span className="text-sm text-text-primary">{endpoint.endpoint || 'Unknown'}</span>
                    <span className="text-sm font-medium text-text-secondary">{endpoint.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-text-secondary">No active endpoints</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border border-border-light bg-surface-secondary p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
              <Activity className="h-5 w-5" />
              Recent Activity
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : liveData?.recentMessages && liveData.recentMessages.length > 0 ? (
              <div className="space-y-2">
                {liveData.recentMessages.slice(0, 10).map((msg: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded border border-border-light bg-surface-primary p-2"
                  >
                    {msg.hasError ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-text-secondary" />
                    )}
                    <span className="flex-1 text-xs text-text-primary">
                      {msg.isUserMessage ? 'User' : 'AI'} message
                    </span>
                    <span className="text-xs text-text-secondary">
                      {formatTimeAgo(msg.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-text-secondary">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Errors Alert */}
      {liveData?.recentErrors && liveData.recentErrors > 0 && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {liveData.recentErrors} error{liveData.recentErrors !== 1 ? 's' : ''} in the last 15
              minutes
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default LiveDataSection;

