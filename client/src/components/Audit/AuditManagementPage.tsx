import React, { useState } from 'react';
import { ClipboardCheck, Users, Activity } from 'lucide-react';
import { useAuditHealth, useUserList } from '~/data-provider/audit-queries';
import { AuditListView } from './AuditListView';
import { AuditDetailView } from './AuditDetailView';

/**
 * Main Audit Management Page
 * Container for audit management with tabs (standalone mode for CEO Dashboard)
 */
export const AuditManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audits' | 'users' | 'health'>('audits');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data: health } = useAuditHealth();
  const { data: usersData } = useUserList();

  // If a session is selected, show the detail view inline
  if (selectedSessionId) {
    return (
      <AuditDetailView sessionId={selectedSessionId} onBack={() => setSelectedSessionId(null)} />
    );
  }

  const tabs = [
    {
      id: 'audits' as const,
      label: 'Audits',
      icon: ClipboardCheck,
    },
    {
      id: 'users' as const,
      label: 'Users',
      icon: Users,
    },
    {
      id: 'health' as const,
      label: 'Health',
      icon: Activity,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Audit Management
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Review and approve audit reports, manage user access
            </p>
          </div>

          {/* Health Status Badge */}
          {health && (
            <div className="flex items-center space-x-2">
              <div
                className={`h-2 w-2 rounded-full ${health.healthy ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {health.healthy ? 'API Connected' : 'API Unavailable'}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 flex space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6 dark:bg-gray-900">
        {activeTab === 'audits' && <AuditListView onSelectSession={setSelectedSessionId} />}

        {activeTab === 'users' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Audit Users
            </h2>
            {usersData && usersData.users.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        User ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Session Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {usersData.users.map((user) => (
                      <tr key={user.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {user.userId}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {user.email || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {user.sessionCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                <Users className="mb-2 h-12 w-12" />
                <p>No users found</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'health' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              API Health Status
            </h2>
            {health ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div
                    className={`h-4 w-4 rounded-full ${
                      health.healthy ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {health.healthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {health.status}
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Timestamp</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {health.timestamp ? new Date(health.timestamp).toLocaleString() : '-'}
                    </div>
                  </div>
                </div>

                {health.message && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/30">
                    <p className="text-sm text-blue-800 dark:text-blue-300">{health.message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                <Activity className="mb-2 h-12 w-12 animate-pulse" />
                <p>Loading health status...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditManagementPage;
