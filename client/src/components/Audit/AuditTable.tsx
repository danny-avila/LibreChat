import React from 'react';
import { Eye, Edit, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { AuditSession } from '~/types/audit';
import { formatDistanceToNow } from 'date-fns';

const safeFormatDistance = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '-' : formatDistanceToNow(d, { addSuffix: true });
};

interface AuditTableProps {
  audits: AuditSession[];
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
}

/**
 * Audit Table Component
 * Displays list of audits in a responsive table
 */
export const AuditTable: React.FC<AuditTableProps> = ({ audits, isLoading, onSelectSession }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-3 h-12 w-12 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No audits found</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      COMPLETED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      PROCESSED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
          styles[status as keyof typeof styles] || styles.PAID
        }`}
      >
        {status}
      </span>
    );
  };

  const getApprovalBadge = (approved: boolean) => {
    return approved ? (
      <span className="inline-flex items-center space-x-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3 w-3" />
        <span>Approved</span>
      </span>
    ) : (
      <span className="inline-flex items-center space-x-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        <Clock className="h-3 w-3" />
        <span>Pending</span>
      </span>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Desktop Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Session ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Approval
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {audits.map((audit) => (
              <tr
                key={audit.id}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                onClick={() => onSelectSession(audit.id)}
              >
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {audit.id.substring(0, 12)}...
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {audit.user.name || 'N/A'}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">{audit.user.email}</div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(audit.status)}</td>
                <td className="whitespace-nowrap px-6 py-4">
                  {audit.report ? getApprovalBadge(audit.report.approved) : '-'}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {safeFormatDistance(audit.createdAt)}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSession(audit.id);
                      }}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {audit.report && !audit.report.approved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSession(audit.id);
                        }}
                        className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                        title="Edit Report"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="block divide-y divide-gray-200 dark:divide-gray-700 md:hidden">
        {audits.map((audit) => (
          <div
            key={audit.id}
            onClick={() => onSelectSession(audit.id)}
            className="cursor-pointer bg-white p-4 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {audit.user.name || 'N/A'}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {audit.user.email}
                </div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ID: {audit.id.substring(0, 12)}...
                </div>
              </div>
              <div className="flex flex-col items-end space-y-2">
                {getStatusBadge(audit.status)}
                {audit.report && getApprovalBadge(audit.report.approved)}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {safeFormatDistance(audit.createdAt)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSession(audit.id);
                }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuditTable;
