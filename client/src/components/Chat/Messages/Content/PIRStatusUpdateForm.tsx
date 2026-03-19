import React, { useState, useCallback, useMemo } from 'react';
import { Button, Label } from '@librechat/client';
import {
  CheckCircle,
  Loader2,
  AlertTriangle,
  Zap,
  Target,
  Clock,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { useAuthContext } from '~/hooks';

// ── Interfaces ──────────────────────────────────────────────────────────

interface PIRStatusRecommendation {
  recommendationId: string;
  recId: string;
  actionSummary: string;
  priorityTier: string;
  priorityScore: number;
  status: string;
  effortEstimate: string;
  expectedImpact: string;
  problemName: string;
  optimizationType: string;
  completedAt?: string | null;
}

interface PIRStatusReport {
  reportId: string;
  productName: string;
  pageUrl: string;
  generatedAt: string;
  mode: string;
}

interface StatusUpdate {
  recommendationId: string;
  status: string;
  completedAt?: string | null;
}

interface PIRStatusUpdateSubmitData {
  report: PIRStatusReport;
  updates: StatusUpdate[];
  toolResponse?: any;
  updatedCount?: number;
  totalCount?: number;
}

interface PIRStatusUpdateFormProps {
  onSubmit?: (data: PIRStatusUpdateSubmitData) => void;
  onCancel?: () => void;
  report: PIRStatusReport;
  recommendations: PIRStatusRecommendation[];
  serverName?: string;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: PIRStatusUpdateSubmitData;
}

// ── Constants ───────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_OPTIONS = [
  {
    value: 'pending',
    label: 'Pending',
    icon: Clock,
    color: 'text-gray-400',
    bg: 'bg-gray-500/20',
    border: 'border-gray-500',
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    icon: Loader2,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    border: 'border-blue-500',
  },
  {
    value: 'completed',
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    border: 'border-green-500',
  },
  {
    value: 'skipped',
    label: 'Skipped',
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500',
  },
] as const;

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/40' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/40' },
};

// ── Component ───────────────────────────────────────────────────────────

const PIRStatusUpdateForm: React.FC<PIRStatusUpdateFormProps> = ({
  onSubmit,
  onCancel,
  report,
  recommendations,
  serverName = '',
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const { token } = useAuthContext();
  const [statusChanges, setStatusChanges] = useState<Record<string, string>>({});
  const [dateChanges, setDateChanges] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A row is "changed" if status or date differs from original
  const changedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(statusChanges)) ids.add(id);
    for (const id of Object.keys(dateChanges)) ids.add(id);
    return ids;
  }, [statusChanges, dateChanges]);

  const changedCount = changedIds.size;

  const handleStatusChange = useCallback(
    (recommendationId: string, originalStatus: string, newStatus: string) => {
      setStatusChanges((prev) => {
        const next = { ...prev };
        if (newStatus === originalStatus) {
          delete next[recommendationId];
        } else {
          next[recommendationId] = newStatus;
        }
        return next;
      });
    },
    [],
  );

  const handleDateChange = useCallback(
    (recommendationId: string, originalDate: string | null | undefined, newDate: string) => {
      setDateChanges((prev) => {
        const next = { ...prev };
        const orig = originalDate || TODAY;
        if (newDate === orig) {
          delete next[recommendationId];
        } else {
          next[recommendationId] = newDate;
        }
        return next;
      });
    },
    [],
  );

  const getEffectiveStatus = useCallback(
    (rec: PIRStatusRecommendation) => statusChanges[rec.recommendationId] || rec.status,
    [statusChanges],
  );

  const getEffectiveDate = useCallback(
    (rec: PIRStatusRecommendation) =>
      dateChanges[rec.recommendationId] || rec.completedAt?.split('T')[0] || TODAY,
    [dateChanges],
  );

  const handleSubmit = useCallback(async () => {
    if (changedCount === 0 || !token) return;
    setIsSubmitting(true);

    try {
      const updates: StatusUpdate[] = [...changedIds].map((recommendationId) => {
        const rec = recommendations.find((r) => r.recommendationId === recommendationId);
        const status = statusChanges[recommendationId] || rec?.status || 'pending';
        const completedAt =
          status === 'completed'
            ? dateChanges[recommendationId] || rec?.completedAt?.split('T')[0] || TODAY
            : null;
        return { recommendationId, status, completedAt };
      });

      const toolId = `prod_int_bulk_update_recommendation_status_mcp_${serverName}`;

      const response = await fetch(`/api/agents/tools/${encodeURIComponent(toolId)}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();

      onSubmit?.({
        report,
        updates,
        toolResponse: result,
        updatedCount: updates.length,
        totalCount: recommendations.length,
      });
    } catch (error) {
      console.error('Error updating PIR recommendation statuses:', error);
      onSubmit?.({
        report,
        updates: [],
        toolResponse: { error: error instanceof Error ? error.message : 'Unknown error' },
        updatedCount: 0,
        totalCount: recommendations.length,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    changedCount,
    changedIds,
    statusChanges,
    dateChanges,
    report,
    recommendations,
    serverName,
    token,
    onSubmit,
  ]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const getStatusConfig = (status: string) =>
    STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  const getTierStyle = (tier: string) => TIER_STYLES[tier] || TIER_STYLES.medium;

  // ── Cancelled State ─────────────────────────────────────────────────
  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500"></div>
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Form Cancelled</h3>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">
          The recommendation status update has been cancelled.
        </p>
      </div>
    );
  }

  // ── Submitted State ─────────────────────────────────────────────────
  if (isSubmitted && submittedData) {
    const updatedCount = submittedData.updatedCount || 0;
    const totalCount = submittedData.totalCount || 0;

    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-4 shadow-lg">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-400">Status Update Submitted</h3>
          </div>
          <p className="text-sm text-green-300">
            Updated {updatedCount} of {totalCount} recommendation statuses for{' '}
            <span className="font-medium">{submittedData.report?.productName}</span>.
          </p>
        </div>

        {submittedData.updates && submittedData.updates.length > 0 && (
          <div className="space-y-2">
            <Label className="mb-2 block text-sm font-medium text-white">Changes Applied</Label>
            {submittedData.updates.map((update) => {
              const rec = recommendations.find(
                (r) => r.recommendationId === update.recommendationId,
              );
              const statusConfig = getStatusConfig(update.status);
              const StatusIcon = statusConfig.icon;
              return (
                <div
                  key={update.recommendationId}
                  className="flex items-center justify-between rounded-md border border-green-500/30 bg-gray-700 px-3 py-2"
                >
                  <span className="text-sm text-white">
                    {rec?.recId || update.recommendationId}
                  </span>
                  <div className="flex items-center gap-3">
                    {update.completedAt && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {update.completedAt}
                      </span>
                    )}
                    <div className={`flex items-center gap-1 text-sm ${statusConfig.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span>{statusConfig.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Active Form ─────────────────────────────────────────────────────
  return (
    <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-4 shadow-lg">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Update Recommendation Statuses</h3>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-300">
            <span className="font-medium text-white">{report.productName}</span>
            {report.pageUrl && <span className="ml-2 text-gray-500">({report.pageUrl})</span>}
          </p>
          <p className="text-xs text-gray-500">
            {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}{' '}
            &middot; Report {report.reportId}
          </p>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="mb-4 space-y-2">
        {recommendations.map((rec) => {
          const tierStyle = getTierStyle(rec.priorityTier);
          const currentStatus = getEffectiveStatus(rec);
          const currentDate = getEffectiveDate(rec);
          const isChanged = changedIds.has(rec.recommendationId);
          const statusConfig = getStatusConfig(currentStatus);
          const showDatePicker = currentStatus === 'completed';

          return (
            <div
              key={rec.recommendationId}
              className={`rounded-lg border p-3 transition-colors ${
                isChanged ? 'border-blue-500/60 bg-blue-900/10' : 'bg-gray-750 border-gray-700'
              }`}
            >
              {/* Top row: recId, priority badge, date picker, status dropdown */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="shrink-0 font-mono text-sm font-medium text-gray-300">
                  {rec.recId}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}
                >
                  {rec.priorityTier}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {showDatePicker && (
                    <input
                      type="date"
                      value={currentDate}
                      onChange={(e) =>
                        handleDateChange(rec.recommendationId, rec.completedAt, e.target.value)
                      }
                      className="rounded-md border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  <select
                    value={currentStatus}
                    onChange={(e) =>
                      handleStatusChange(rec.recommendationId, rec.status, e.target.value)
                    }
                    className={`rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusConfig.bg} ${statusConfig.border} ${statusConfig.color} bg-gray-700`}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Problem & action summary */}
              <p className="mt-1.5 text-sm text-gray-400">
                <span className="font-medium text-gray-300">{rec.problemName}</span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{rec.actionSummary}</p>

              {/* Meta row */}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {rec.effortEstimate}
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {rec.expectedImpact}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {rec.optimizationType}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleCancel}
          variant="outline"
          className="flex-1 border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={changedCount === 0 || isSubmitting}
          className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              Updating...
            </span>
          ) : changedCount > 0 ? (
            `Update ${changedCount} Status${changedCount !== 1 ? 'es' : ''}`
          ) : (
            'No Changes'
          )}
        </Button>
      </div>
    </div>
  );
};

export default PIRStatusUpdateForm;
