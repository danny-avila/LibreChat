import React, { useState } from 'react';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  Clock,
  User,
  Mail,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Target,
  Zap,
  Calendar as CalendarIcon,
  DollarSign,
  History,
} from 'lucide-react';
import { useAuditDetails } from '~/data-provider/audit-queries';
import { ApprovalModal } from './ApprovalModal';
import { AuditEditModal } from './AuditEditModal';
import { formatDistanceToNow, format, isValid } from 'date-fns';

const safeFormat = (dateStr: string | null | undefined, fmt: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isValid(d) ? format(d, fmt) : '-';
};

const safeFormatDistance = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '-';
};

const getPriorityLabel = (priority: number | string) => {
  if (typeof priority === 'string') return priority;
  if (priority === 1) return 'High';
  if (priority === 2) return 'Medium';
  if (priority === 3) return 'Low';
  return String(priority);
};

const getPriorityColor = (priority: number | string) => {
  const p = typeof priority === 'number' ? priority : 0;
  if (p === 1) return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  if (p === 2) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
  if (p === 3) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
  return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
};

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    low: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
    medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400',
    high: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400',
    critical: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
  };
  return colors[severity?.toLowerCase()] ?? colors.medium;
};

interface AuditDetailViewProps {
  sessionId: string;
  onBack: () => void;
}

export const AuditDetailView: React.FC<AuditDetailViewProps> = ({ sessionId, onBack }) => {
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: audit, isLoading, error, refetch } = useAuditDetails(sessionId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Failed to Load Audit
          </h2>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {(error as Error)?.message || 'Audit not found'}
          </p>
          <button onClick={onBack} className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Back to Audits
          </button>
        </div>
      </div>
    );
  }

  // API response shape: { session, user, report, versions }
  const raw = audit as any;
  const session = raw.session ?? raw;
  const user = raw.user ?? session.user;
  const report = raw.report ?? session.report;
  const versions = raw.versions ?? report?.versions ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Audits</span>
          </button>

          {report && !report.approved && (
            <div className="flex space-x-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Edit className="h-4 w-4" />
                <span>Edit Report</span>
              </button>
              <button
                onClick={() => setShowApprovalModal(true)}
                className="flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Approve & Send</span>
              </button>
            </div>
          )}
        </div>

        {/* Session Info Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Audit Session Details
            </h1>
            {report && (
              <span
                className={`flex items-center space-x-2 rounded-full px-3 py-1 text-sm font-semibold ${
                  report.approved
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}
              >
                {report.approved ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Approved</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4" />
                    <span>Pending Approval</span>
                  </>
                )}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-start space-x-3">
              <User className="mt-1 h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">User</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                  {user?.name || 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Mail className="mt-1 h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-base text-gray-900 dark:text-gray-100">{user?.email || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Calendar className="mt-1 h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                <p className="text-base text-gray-900 dark:text-gray-100">
                  {safeFormat(session.createdAt, 'PPpp')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {safeFormatDistance(session.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Target className="mt-1 h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
                <p className="text-base text-gray-900 dark:text-gray-100">
                  {session.status || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Content */}
        {report ? (
          <>
            {/* Executive Summary */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
                Executive Summary
              </h2>
              <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {report.executiveSummary}
              </p>
            </div>

            {/* Pain Points */}
            {(report.painPoints || []).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Pain Points ({(report.painPoints || []).length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {(report.painPoints || []).map((point: any, index: number) => (
                    <div
                      key={index}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {point.title}
                        </h3>
                        {point.severity && (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${getSeverityColor(point.severity)}`}
                          >
                            {point.severity}
                          </span>
                        )}
                      </div>
                      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                        {point.description}
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                        {point.category && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Category:
                            </span>{' '}
                            <span className="text-gray-600 dark:text-gray-400">
                              {point.category}
                            </span>
                          </div>
                        )}
                        {point.current_time_spent && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Time Spent:
                            </span>{' '}
                            <span className="text-gray-600 dark:text-gray-400">
                              {point.current_time_spent}
                            </span>
                          </div>
                        )}
                        {point.business_impact && (
                          <div className="md:col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Business Impact:
                            </span>{' '}
                            <span className="text-gray-600 dark:text-gray-400">
                              {point.business_impact}
                            </span>
                          </div>
                        )}
                        {point.root_cause && (
                          <div className="md:col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Root Cause:
                            </span>{' '}
                            <span className="text-gray-600 dark:text-gray-400">
                              {point.root_cause}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {(report.recommendations || []).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Recommendations ({(report.recommendations || []).length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {(report.recommendations || []).map((rec: any, index: number) => (
                    <div
                      key={index}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {rec.title}
                        </h3>
                        {rec.priority != null && (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${getPriorityColor(rec.priority)}`}
                          >
                            {getPriorityLabel(rec.priority)}
                          </span>
                        )}
                      </div>
                      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                        {rec.description}
                      </p>
                      <div className="space-y-1 text-xs">
                        {rec.estimated_timeline && (
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Timeline:
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">
                              {rec.estimated_timeline}
                            </span>
                          </div>
                        )}
                        {rec.expected_impact && (
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Impact:
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">
                              {rec.expected_impact}
                            </span>
                          </div>
                        )}
                        {rec.if_jamot_lui && (
                          <div className="mt-2 rounded bg-blue-50 p-2 dark:bg-blue-900/20">
                            <p className="font-medium text-blue-700 dark:text-blue-300">
                              Jamot LUI Solution:
                            </p>
                            {rec.if_jamot_lui.tool && (
                              <p className="text-blue-600 dark:text-blue-400">
                                Tool: {rec.if_jamot_lui.tool}
                              </p>
                            )}
                            {rec.if_jamot_lui.how_it_helps && (
                              <p className="text-blue-600 dark:text-blue-400">
                                {rec.if_jamot_lui.how_it_helps}
                              </p>
                            )}
                          </div>
                        )}
                        {(rec.tools_or_approaches || []).length > 0 && (
                          <div className="mt-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Tools:
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(rec.tools_or_approaches || []).map((tool: string, i: number) => (
                                <span
                                  key={i}
                                  className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Wins & Long Term */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Quick Wins */}
              {(report.quickWins || []).length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-4 flex items-center space-x-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Quick Wins
                    </h2>
                  </div>
                  <ul className="space-y-3">
                    {(report.quickWins || []).map((win: any, index: number) => (
                      <li
                        key={index}
                        className="rounded-lg border border-gray-100 p-3 dark:border-gray-700"
                      >
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {typeof win === 'string' ? win : win.action}
                        </p>
                        {win.impact && (
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Impact:</span> {win.impact}
                          </p>
                        )}
                        {win.time_to_implement && (
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            <span className="font-medium">Time:</span> {win.time_to_implement}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Long Term Initiatives */}
              {(report.longTermInitiatives || []).length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-4 flex items-center space-x-2">
                    <CalendarIcon className="h-5 w-5 text-purple-500" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      Long-Term Initiatives
                    </h2>
                  </div>
                  <ul className="space-y-3">
                    {(report.longTermInitiatives || []).map((item: any, index: number) => (
                      <li
                        key={index}
                        className="rounded-lg border border-gray-100 p-3 dark:border-gray-700"
                      >
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {typeof item === 'string' ? item : item.initiative}
                        </p>
                        {item.vision && (
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            {item.vision}
                          </p>
                        )}
                        {item.timeline_months && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                            <span className="font-medium">Timeline:</span> {item.timeline_months}{' '}
                            months
                          </p>
                        )}
                        {item.builds_on && (
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            <span className="font-medium">Builds on:</span> {item.builds_on}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ROI */}
            {report.estimatedROI && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center space-x-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Estimated ROI
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {report.estimatedROI.hours_saved_per_week != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Hours Saved / Week
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {report.estimatedROI.hours_saved_per_week}h
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.net_annual_saving != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Net Annual Saving
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {typeof report.estimatedROI.net_annual_saving === 'number'
                          ? `$${report.estimatedROI.net_annual_saving.toLocaleString()}`
                          : report.estimatedROI.net_annual_saving}
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.roi_percentage != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ROI</p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {report.estimatedROI.roi_percentage}%
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.total_investment != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Total Investment
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {typeof report.estimatedROI.total_investment === 'number'
                          ? `$${report.estimatedROI.total_investment.toLocaleString()}`
                          : report.estimatedROI.total_investment}
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.payback_period_months != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Payback Period
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {report.estimatedROI.payback_period_months} months
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.first_year_net_saving != null && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        First Year Net Saving
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {typeof report.estimatedROI.first_year_net_saving === 'number'
                          ? `$${report.estimatedROI.first_year_net_saving.toLocaleString()}`
                          : report.estimatedROI.first_year_net_saving}
                      </p>
                    </div>
                  )}
                  {report.estimatedROI.additional_notes && (
                    <div className="md:col-span-3">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {report.estimatedROI.additional_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Version History */}
            {versions.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-4 flex items-center space-x-2">
                  <History className="h-5 w-5 text-gray-500" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Version History
                  </h2>
                </div>
                <div className="space-y-3">
                  {versions.map((version: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-start space-x-3 border-l-2 border-blue-500 pl-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Version {version.versionNumber}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            by {version.editedBy}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {version.changeNotes}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {safeFormat(version.editedAt, 'PPpp')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <Clock className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              No Report Available
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              This audit session doesn't have a report yet.
            </p>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {report && (
        <ApprovalModal
          sessionId={session.id}
          userEmail={user?.email}
          userName={user?.name}
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          onSuccess={() => {
            refetch();
          }}
        />
      )}

      {/* Edit Modal */}
      {report && (
        <AuditEditModal
          sessionId={session.id}
          report={report}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default AuditDetailView;
