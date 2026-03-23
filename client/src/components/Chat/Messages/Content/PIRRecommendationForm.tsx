import React, { useState, useCallback, useMemo } from 'react';
import { Button, Label, Input, TextareaAutosize, TooltipAnchor } from '@librechat/client';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  Zap,
  Target,
  Clock,
  TrendingUp,
  Globe,
  FileText,
  BarChart3,
  Map,
  MessageSquare,
  Link2,
  Eye,
} from 'lucide-react';
import { useAuthContext } from '~/hooks';

// ── Interfaces ──────────────────────────────────────────────────────────

interface ReportMeta {
  productId: string;
  productName: string;
  pageUrl: string;
  generatedAt: string;
  totalProblems: number;
  totalEvidenceRecords: number;
  totalFriction: number;
  xofuEnriched: boolean;
  mode: string;
  xofuProjectId?: string | null;
  xofuVisibility?: number | null;
  xofuVisibilityDelta?: number | null;
  xofuCitationCount?: number | null;
  xofuCitationDelta?: number | null;
  xofuSituationsDetected?: string[] | null;
  satelliteDomainsIdentified?: string[] | null;
}

interface SpecificChange {
  changeId: number;
  description: string;
  currentState: string;
  recommendedState: string;
}

interface SuccessMetric {
  metric: string;
  measurement: string;
}

interface CompetitiveAngle {
  addressesCompetitorWeakness?: boolean | null;
  competitorReference?: string | null;
}

interface XofuContext {
  situationType?: string | null;
  platform?: string | null;
  prompt?: string | null;
  aiResponseEvidence?: string | null;
  citationSourceInResponse?: string | null;
  qualifiersToPreempt?: string[] | null;
}

interface MessagingGuidance {
  keyTerms: string[];
  positioning: string;
  specificAddition: string;
}

interface BrandComparison {
  brand: string;
  price: string;
  differentiator: string;
}

interface SatellitePageBlueprint {
  suggestedUrl: string;
  pageType: string;
  targetWordCount: string;
  h1: string;
  keySections: string[];
  dataPointsToInclude?: string[] | null;
  internalLinksTo?: string[] | null;
  internalLinksFrom?: string | null;
  brandsToCompare?: BrandComparison[] | null;
}

interface Recommendation {
  recId: string;
  outputType: string;
  priorityTier: string;
  priorityScore: number;
  baseScore: number;
  xofuBoostApplied: boolean;
  xofuBoostMultiplier: number;
  problemRef: string;
  problemName: string;
  recommendationType: string[];
  optimizationType: string;
  actionSummary: string;
  targetAudience: string;
  effortEstimate: string;
  expectedImpact: string;
  keyTermsToInclude: string[];
  successMetrics: SuccessMetric[];
  targetUrl?: string | null;
  targetDomain?: string | null;
  domainOwnership?: string | null;
  targetPrompts?: string[] | null;
  dependencies?: string[] | null;
  evidenceUrls?: string[] | null;
  competitiveAngle?: CompetitiveAngle | null;
  xofuContext?: XofuContext | null;
  specificChanges?: SpecificChange[] | null;
  onsiteSpecificChanges?: SpecificChange[] | null;
  messagingGuidance?: MessagingGuidance | null;
  satellitePageBlueprint?: SatellitePageBlueprint | null;
}

interface ImplementationRoadmap {
  immediateThisWeek: string[];
  shortTermThisMonth: string[];
  quarterly: string[];
}

interface CitationTarget {
  question: string;
  currentAiSource: string;
  zenbusinessAnswerLocation: string;
  recId: string;
}

interface PIRFormSubmitData {
  reportMeta: ReportMeta;
  recommendations: Recommendation[];
  implementationRoadmap: ImplementationRoadmap;
  citationOptimizationTargets: CitationTarget[];
  toolResponse?: any;
  selectedCount?: number;
  totalCount?: number;
}

interface PIRRecommendationFormProps {
  onSubmit?: (data: PIRFormSubmitData) => void;
  onCancel?: () => void;
  reportMeta: ReportMeta;
  recommendations: Recommendation[];
  implementationRoadmap: ImplementationRoadmap;
  citationOptimizationTargets: CitationTarget[];
  serverName?: string;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: PIRFormSubmitData;
}

// ── Utilities ───────────────────────────────────────────────────────────

function stripNulls(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    const filtered = obj.map(stripNulls).filter((item) => item !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const stripped = stripNulls(value);
      if (stripped !== undefined) {
        result[key] = stripped;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return obj;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-700',
  high: 'bg-red-500',
  medium: 'bg-orange-500',
  low: 'bg-green-500',
};

const PRIORITY_TEXT_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-orange-400',
  low: 'text-green-400',
};

// ── Component ───────────────────────────────────────────────────────────

const PIRRecommendationForm: React.FC<PIRRecommendationFormProps> = ({
  onSubmit,
  onCancel,
  reportMeta,
  recommendations,
  implementationRoadmap,
  citationOptimizationTargets,
  serverName = '',
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const { token } = useAuthContext();

  // Selection: all selected initially
  const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(
    () => new Set(recommendations.map((r) => r.recId)),
  );
  // Edits: recId -> partial overrides
  const [edits, setEdits] = useState<Record<string, Partial<Recommendation>>>({});
  // Expanded cards
  const [expandedRecIds, setExpandedRecIds] = useState<Set<string>>(new Set());
  // Cards in edit mode
  const [editingRecIds, setEditingRecIds] = useState<Set<string>>(new Set());
  // Roadmap section expanded
  const [roadmapExpanded, setRoadmapExpanded] = useState(false);
  // Citation section expanded
  const [citationsExpanded, setCitationsExpanded] = useState(false);
  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // New key term input per card
  const [newTermInputs, setNewTermInputs] = useState<Record<string, string>>({});

  // ── Helpers ─────────────────────────────────────────────────────────

  const getEffectiveRec = useCallback(
    (rec: Recommendation): Recommendation => {
      const recEdits = edits[rec.recId];
      if (!recEdits) return rec;
      return { ...rec, ...recEdits };
    },
    [edits],
  );

  const updateEdit = useCallback((recId: string, field: string, value: any) => {
    setEdits((prev) => ({
      ...prev,
      [recId]: { ...prev[recId], [field]: value },
    }));
  }, []);

  // ── Selection ───────────────────────────────────────────────────────

  const toggleSelection = useCallback((recId: string) => {
    setSelectedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) {
        next.delete(recId);
      } else {
        next.add(recId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedRecIds(new Set(recommendations.map((r) => r.recId)));
  }, [recommendations]);

  const deselectAll = useCallback(() => {
    setSelectedRecIds(new Set());
  }, []);

  // ── Expand / Edit toggles ──────────────────────────────────────────

  const toggleExpanded = useCallback((recId: string) => {
    setExpandedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) {
        next.delete(recId);
      } else {
        next.add(recId);
      }
      return next;
    });
  }, []);

  const toggleEditing = useCallback((recId: string) => {
    setEditingRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) {
        next.delete(recId);
      } else {
        next.add(recId);
        // Auto-expand when entering edit mode
        setExpandedRecIds((ep) => new Set(ep).add(recId));
      }
      return next;
    });
  }, []);

  // ── Key terms editing ──────────────────────────────────────────────

  const removeKeyTerm = useCallback(
    (recId: string, termIndex: number) => {
      const rec = recommendations.find((r) => r.recId === recId);
      if (!rec) return;
      const effective = getEffectiveRec(rec);
      const updated = [...(effective.keyTermsToInclude || [])];
      updated.splice(termIndex, 1);
      updateEdit(recId, 'keyTermsToInclude', updated);
    },
    [recommendations, getEffectiveRec, updateEdit],
  );

  const addKeyTerm = useCallback(
    (recId: string) => {
      const term = (newTermInputs[recId] || '').trim();
      if (!term) return;
      const rec = recommendations.find((r) => r.recId === recId);
      if (!rec) return;
      const effective = getEffectiveRec(rec);
      const updated = [...(effective.keyTermsToInclude || []), term];
      updateEdit(recId, 'keyTermsToInclude', updated);
      setNewTermInputs((prev) => ({ ...prev, [recId]: '' }));
    },
    [newTermInputs, recommendations, getEffectiveRec, updateEdit],
  );

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (selectedRecIds.size === 0 || !token) return;
    setIsSubmitting(true);

    try {
      const selectedRecs = recommendations
        .filter((r) => selectedRecIds.has(r.recId))
        .map((r) => stripNulls(getEffectiveRec(r)));

      const selectedRecIdSet = new Set(selectedRecs.map((r: any) => r.recId));
      const filteredCitationTargets = citationOptimizationTargets.filter((ct) =>
        selectedRecIdSet.has(ct.recId),
      );

      const payload = {
        reportMeta: stripNulls(reportMeta),
        recommendations: selectedRecs,
        implementationRoadmap,
        citationOptimizationTargets: filteredCitationTargets,
      };

      const toolId = `create_pir_recommendations_mcp_${serverName}`;

      const response = await fetch(`/api/agents/tools/${encodeURIComponent(toolId)}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();

      onSubmit?.({
        reportMeta,
        recommendations: selectedRecs,
        implementationRoadmap,
        citationOptimizationTargets: filteredCitationTargets,
        toolResponse: result,
        selectedCount: selectedRecs.length,
        totalCount: recommendations.length,
      });
    } catch (error) {
      console.error('Error creating PIR recommendations:', error);
      onSubmit?.({
        reportMeta,
        recommendations: [],
        implementationRoadmap,
        citationOptimizationTargets: [],
        toolResponse: { error: error instanceof Error ? error.message : 'Unknown error' },
        selectedCount: 0,
        totalCount: recommendations.length,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedRecIds,
    recommendations,
    getEffectiveRec,
    citationOptimizationTargets,
    reportMeta,
    implementationRoadmap,
    serverName,
    token,
    onSubmit,
  ]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // ── Tier counts ────────────────────────────────────────────────────

  const tierCounts = useMemo(() => {
    const selected = recommendations.filter((r) => selectedRecIds.has(r.recId));
    return {
      critical: selected.filter((r) => r.priorityTier === 'critical').length,
      high: selected.filter((r) => r.priorityTier === 'high').length,
      medium: selected.filter((r) => r.priorityTier === 'medium').length,
      low: selected.filter((r) => r.priorityTier === 'low').length,
    };
  }, [recommendations, selectedRecIds]);

  // ── Cancelled state ────────────────────────────────────────────────

  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              PIR Recommendations Cancelled
            </h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            The product intelligence recommendations form was cancelled.
          </p>
        </div>
      </div>
    );
  }

  // ── Submitted state ────────────────────────────────────────────────

  if (isSubmitted && submittedData) {
    const sc = submittedData.selectedCount || 0;
    const tc = submittedData.totalCount || 0;
    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-4 shadow-lg">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-400">
              Product Intelligence Recommendations Submitted
            </h3>
          </div>
          <p className="text-sm text-green-300">
            {sc} of {tc} recommendations submitted for{' '}
            <span className="font-medium">{reportMeta.productName}</span>.
          </p>
        </div>

        <div className="space-y-3 rounded-lg bg-gray-900/50 p-4">
          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Product</Label>
            <div className="flex items-center gap-2 text-white">
              <Globe className="h-4 w-4 text-gray-400" />
              <span>{reportMeta.productName}</span>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Page URL</Label>
            <div className="text-sm text-blue-400">{reportMeta.pageUrl}</div>
          </div>
          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Recommendations</Label>
            <div className="flex flex-wrap gap-2 text-sm">
              {tierCounts.critical > 0 && (
                <span className="rounded-full bg-red-700/20 px-2 py-0.5 text-red-300">
                  {tierCounts.critical} critical
                </span>
              )}
              {tierCounts.high > 0 && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-400">
                  {tierCounts.high} high
                </span>
              )}
              {tierCounts.medium > 0 && (
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-orange-400">
                  {tierCounts.medium} medium
                </span>
              )}
              {tierCounts.low > 0 && (
                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-green-400">
                  {tierCounts.low} low
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting state ───────────────────────────────────────────────

  if (isSubmitting) {
    return (
      <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-8 shadow-lg">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <h3 className="mb-2 text-lg font-semibold text-white">Creating Recommendations...</h3>
          <p className="text-sm text-gray-400">
            Submitting {selectedRecIds.size} recommendations for {reportMeta.productName}
          </p>
        </div>
      </div>
    );
  }

  // ── Active form ────────────────────────────────────────────────────

  return (
    <div className="my-4 space-y-4 rounded-xl border border-gray-600 bg-gray-800 p-4 shadow-lg">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Product Intelligence Recommendations</h3>
        </div>
        <p className="text-sm text-gray-300">
          Review, edit, and select recommendations before submitting. Chat is disabled until you
          submit or cancel.
        </p>
      </div>

      {/* Report Meta Summary */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-400" />
          <span className="font-medium text-white">{reportMeta.productName}</span>
          <span className="text-xs text-gray-400">({reportMeta.mode})</span>
        </div>
        <div className="mb-2 break-all text-xs text-blue-400">{reportMeta.pageUrl}</div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded bg-gray-700 px-2 py-0.5 text-gray-300">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {reportMeta.totalProblems} problems
          </span>
          <span className="rounded bg-gray-700 px-2 py-0.5 text-gray-300">
            <FileText className="mr-1 inline h-3 w-3" />
            {reportMeta.totalEvidenceRecords} evidence records
          </span>
          <span className="rounded bg-gray-700 px-2 py-0.5 text-gray-300">
            <BarChart3 className="mr-1 inline h-3 w-3" />
            {(reportMeta.totalFriction ?? 0).toFixed(1)} friction
          </span>
          {reportMeta.xofuEnriched && (
            <span className="rounded bg-purple-500/20 px-2 py-0.5 text-purple-400">
              <Zap className="mr-1 inline h-3 w-3" />
              xOFU enriched
            </span>
          )}
          {reportMeta.xofuVisibility != null && (
            <span className="rounded bg-purple-500/20 px-2 py-0.5 text-purple-400">
              Visibility: {(reportMeta.xofuVisibility ?? 0).toFixed(1)}
              {reportMeta.xofuVisibilityDelta != null && (
                <span
                  className={
                    (reportMeta.xofuVisibilityDelta ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }
                >
                  {' '}
                  ({(reportMeta.xofuVisibilityDelta ?? 0) >= 0 ? '+' : ''}
                  {(reportMeta.xofuVisibilityDelta ?? 0).toFixed(1)})
                </span>
              )}
            </span>
          )}
          {reportMeta.xofuCitationCount != null && (
            <span className="rounded bg-purple-500/20 px-2 py-0.5 text-purple-400">
              Citations: {reportMeta.xofuCitationCount}
              {reportMeta.xofuCitationDelta != null && (
                <span
                  className={reportMeta.xofuCitationDelta >= 0 ? 'text-green-400' : 'text-red-400'}
                >
                  {' '}
                  ({reportMeta.xofuCitationDelta >= 0 ? '+' : ''}
                  {reportMeta.xofuCitationDelta})
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Selection Bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-700/50 px-3 py-2">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={selectedRecIds.size === recommendations.length ? deselectAll : selectAll}
            className="h-7 border-gray-600 bg-gray-700 text-xs text-gray-300 hover:bg-gray-600"
          >
            {selectedRecIds.size === recommendations.length ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-sm text-gray-300">
            <span className="font-medium text-white">{selectedRecIds.size}</span> of{' '}
            {recommendations.length} selected
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          {tierCounts.critical > 0 && (
            <span className="rounded-full bg-red-700/20 px-2 py-0.5 text-red-300">
              {tierCounts.critical} critical
            </span>
          )}
          {tierCounts.high > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-400">
              {tierCounts.high} high
            </span>
          )}
          {tierCounts.medium > 0 && (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-orange-400">
              {tierCounts.medium} medium
            </span>
          )}
          {tierCounts.low > 0 && (
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-green-400">
              {tierCounts.low} low
            </span>
          )}
        </div>
      </div>

      {/* Recommendation Cards */}
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {recommendations.map((rec) => {
          const isSelected = selectedRecIds.has(rec.recId);
          const isExpanded = expandedRecIds.has(rec.recId);
          const isEditing = editingRecIds.has(rec.recId);
          const effective = getEffectiveRec(rec);

          return (
            <div
              key={rec.recId}
              className={`rounded-lg border p-3 transition-all ${
                isSelected
                  ? 'border-orange-500 bg-orange-500/5'
                  : 'border-gray-700 bg-gray-800/50 opacity-60'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelection(rec.recId)}
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500'
                      : 'border-gray-500 bg-gray-700 hover:border-gray-400'
                  }`}
                >
                  {isSelected && (
                    <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {/* Priority badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                        PRIORITY_COLORS[rec.priorityTier] || 'bg-gray-500'
                      }`}
                    >
                      {rec.priorityTier} ({(rec.priorityScore ?? 0).toFixed(1)})
                    </span>
                    {/* recId */}
                    <span className="font-mono text-xs text-gray-500">{rec.recId}</span>
                    {/* Output type */}
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">
                      {rec.outputType}
                    </span>
                    {/* xOFU boost */}
                    {rec.xofuBoostApplied && (
                      <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-xs text-purple-400">
                        <Zap className="mr-0.5 inline h-3 w-3" />
                        {(rec.xofuBoostMultiplier ?? 0).toFixed(1)}x
                      </span>
                    )}
                  </div>

                  {/* Problem name */}
                  <div className="mb-1 text-sm font-medium text-white">{effective.problemName}</div>

                  {/* Action summary */}
                  {!isEditing ? (
                    <p className="mb-2 text-sm text-gray-300">{effective.actionSummary}</p>
                  ) : (
                    <div className="mb-2">
                      <Label className="mb-1 block text-xs text-gray-400">Action Summary</Label>
                      <TextareaAutosize
                        aria-label="Action Summary"
                        value={effective.actionSummary}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          updateEdit(rec.recId, 'actionSummary', e.target.value)
                        }
                        className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-white"
                        minRows={2}
                      />
                    </div>
                  )}

                  {/* Tags row */}
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1 rounded bg-gray-700 px-2 py-0.5 text-gray-300">
                      <Target className="h-3 w-3" />
                      {effective.optimizationType}
                    </span>
                    {!isEditing ? (
                      <>
                        <span className="flex items-center gap-1 rounded bg-gray-700 px-2 py-0.5 text-gray-300">
                          <Clock className="h-3 w-3" />
                          {effective.effortEstimate}
                        </span>
                        <span className="flex items-center gap-1 rounded bg-gray-700 px-2 py-0.5 text-gray-300">
                          <TrendingUp className="h-3 w-3" />
                          {effective.expectedImpact}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <Input
                            value={effective.effortEstimate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateEdit(rec.recId, 'effortEstimate', e.target.value)
                            }
                            className="h-6 w-28 border-gray-600 bg-gray-700 px-1 text-xs text-white"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-gray-400" />
                          <Input
                            value={effective.expectedImpact}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateEdit(rec.recId, 'expectedImpact', e.target.value)
                            }
                            className="h-6 w-28 border-gray-600 bg-gray-700 px-1 text-xs text-white"
                          />
                        </div>
                      </>
                    )}
                    {effective.recommendationType.map((t) => (
                      <span key={t} className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-300">
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* Target audience (editable) */}
                  {isEditing && (
                    <div className="mb-2">
                      <Label className="mb-1 block text-xs text-gray-400">Target Audience</Label>
                      <Input
                        value={effective.targetAudience}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateEdit(rec.recId, 'targetAudience', e.target.value)
                        }
                        className="h-7 border-gray-600 bg-gray-700 text-sm text-white"
                      />
                    </div>
                  )}

                  {/* Key terms (always shown, editable in edit mode) */}
                  {(effective.keyTermsToInclude?.length > 0 || isEditing) && (
                    <div className="mb-2">
                      <span className="mb-1 block text-xs text-gray-400">Key Terms</span>
                      <div className="flex flex-wrap gap-1">
                        {effective.keyTermsToInclude?.map((term, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
                          >
                            {term}
                            {isEditing && (
                              <button
                                onClick={() => removeKeyTerm(rec.recId, idx)}
                                className="ml-0.5 text-gray-500 hover:text-red-400"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                        {isEditing && (
                          <span className="inline-flex items-center gap-1">
                            <Input
                              value={newTermInputs[rec.recId] || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setNewTermInputs((prev) => ({
                                  ...prev,
                                  [rec.recId]: e.target.value,
                                }))
                              }
                              onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addKeyTerm(rec.recId);
                                }
                              }}
                              placeholder="Add term..."
                              className="h-6 w-24 border-gray-600 bg-gray-700 px-1 text-xs text-white"
                            />
                            <button
                              onClick={() => addKeyTerm(rec.recId)}
                              className="text-gray-400 hover:text-green-400"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-shrink-0 gap-1">
                  <button
                    onClick={() => toggleEditing(rec.recId)}
                    className={`rounded p-1 transition-colors ${
                      isEditing
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title={isEditing ? 'Done editing' : 'Edit'}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleExpanded(rec.recId)}
                    className="rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-gray-700 pt-3 text-sm">
                  {/* Target audience (read-only in expanded non-edit mode) */}
                  {!isEditing && effective.targetAudience && (
                    <div>
                      <span className="text-xs font-medium text-gray-400">Target Audience</span>
                      <p className="text-gray-300">{effective.targetAudience}</p>
                    </div>
                  )}

                  {/* Target URLs */}
                  {effective.targetUrl && (
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        <Link2 className="mr-1 inline h-3 w-3" />
                        Target URL
                      </span>
                      <div className="mt-1 text-xs">
                        <span className="text-blue-400">{effective.targetUrl}</span>
                        {effective.domainOwnership && (
                          <span className="ml-2 text-gray-500">({effective.domainOwnership})</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Specific Changes */}
                  {effective.specificChanges && effective.specificChanges.length > 0 && (
                    <div>
                      <TooltipAnchor
                        description="Detailed before/after changes — what currently exists vs. what the recommendation proposes."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Specific Changes
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 space-y-2">
                        {effective.specificChanges.map((change, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-gray-700 bg-gray-800 p-2 text-xs"
                          >
                            <div className="mb-1 font-medium text-gray-200">
                              #{change.changeId}: {change.description}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-red-400">Current:</span>
                                <p className="text-gray-400">{change.currentState}</p>
                              </div>
                              <div>
                                <span className="text-green-400">Recommended:</span>
                                <p className="text-gray-300">{change.recommendedState}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Onsite Specific Changes */}
                  {effective.onsiteSpecificChanges &&
                    effective.onsiteSpecificChanges.length > 0 && (
                      <div>
                        <TooltipAnchor
                          description="Same as Specific Changes but focused on edits to the primary owned website (vs. satellite or third-party content)."
                          side="top"
                        >
                          <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                            Onsite Specific Changes
                          </span>
                        </TooltipAnchor>
                        <div className="mt-1 space-y-2">
                          {effective.onsiteSpecificChanges.map((change, idx) => (
                            <div
                              key={idx}
                              className="rounded border border-gray-700 bg-gray-800 p-2 text-xs"
                            >
                              <div className="mb-1 font-medium text-gray-200">
                                #{change.changeId}: {change.description}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-red-400">Current:</span>
                                  <p className="text-gray-400">{change.currentState}</p>
                                </div>
                                <div>
                                  <span className="text-green-400">Recommended:</span>
                                  <p className="text-gray-300">{change.recommendedState}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* xOFU Context */}
                  {effective.xofuContext && (
                    <div>
                      <TooltipAnchor
                        description="How AI platforms (Google AI Overview, GPT-4o, Perplexity) are currently describing and positioning this product — situation type, verbatim AI response evidence, and hedging qualifiers to address."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          <Zap className="mr-1 inline h-3 w-3" />
                          XOFU Context
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 rounded border border-purple-500/30 bg-purple-500/5 p-2 text-xs">
                        {effective.xofuContext.situationType && (
                          <div className="mb-1">
                            <span className="text-purple-400">Situation:</span>{' '}
                            <span className="text-gray-300">
                              {effective.xofuContext.situationType}
                            </span>
                          </div>
                        )}
                        {effective.xofuContext.platform && (
                          <div className="mb-1">
                            <span className="text-purple-400">Platform:</span>{' '}
                            <span className="text-gray-300">{effective.xofuContext.platform}</span>
                          </div>
                        )}
                        {effective.xofuContext.prompt && (
                          <div className="mb-1">
                            <span className="text-purple-400">Prompt:</span>{' '}
                            <span className="text-gray-300">{effective.xofuContext.prompt}</span>
                          </div>
                        )}
                        {effective.xofuContext.aiResponseEvidence && (
                          <div className="mb-1">
                            <span className="text-purple-400">AI Response:</span>{' '}
                            <span className="text-gray-300">
                              {effective.xofuContext.aiResponseEvidence}
                            </span>
                          </div>
                        )}
                        {effective.xofuContext.citationSourceInResponse && (
                          <div className="mb-1">
                            <span className="text-purple-400">Citation Source:</span>{' '}
                            <span className="text-gray-300">
                              {effective.xofuContext.citationSourceInResponse}
                            </span>
                          </div>
                        )}
                        {effective.xofuContext.qualifiersToPreempt &&
                          effective.xofuContext.qualifiersToPreempt.length > 0 && (
                            <div>
                              <span className="text-purple-400">Qualifiers to Preempt:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {effective.xofuContext.qualifiersToPreempt.map((q, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300"
                                  >
                                    {q}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Competitive Angle */}
                  {effective.competitiveAngle && (
                    <div>
                      <TooltipAnchor
                        description="Whether this recommendation addresses a specific competitor weakness, and which competitor is referenced."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Competitive Angle
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 text-xs text-gray-300">
                        {effective.competitiveAngle.addressesCompetitorWeakness && (
                          <span className="mr-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400">
                            Addresses competitor weakness
                          </span>
                        )}
                        {effective.competitiveAngle.competitorReference && (
                          <span>Ref: {effective.competitiveAngle.competitorReference}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Messaging Guidance */}
                  {effective.messagingGuidance && (
                    <div>
                      <TooltipAnchor
                        description="Recommended key terms, positioning statement, and specific content additions for brief-type recommendations."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          <MessageSquare className="mr-1 inline h-3 w-3" />
                          Messaging Guidance
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 rounded border border-gray-700 bg-gray-800 p-2 text-xs">
                        <div className="mb-1">
                          <span className="text-gray-400">Positioning:</span>{' '}
                          <span className="text-gray-300">
                            {effective.messagingGuidance.positioning}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">Specific Addition:</span>{' '}
                          <span className="text-gray-300">
                            {effective.messagingGuidance.specificAddition}
                          </span>
                        </div>
                        {effective.messagingGuidance.keyTerms.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {effective.messagingGuidance.keyTerms.map((t, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-gray-700 px-2 py-0.5 text-gray-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Satellite Blueprint */}
                  {effective.satellitePageBlueprint && (
                    <div>
                      <TooltipAnchor
                        description="Plan for a new satellite page: suggested URL, page type, word count target, H1, key sections, and brands to compare."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          <Globe className="mr-1 inline h-3 w-3" />
                          Satellite Page Blueprint
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 rounded border border-gray-700 bg-gray-800 p-2 text-xs">
                        <div className="mb-1">
                          <span className="text-gray-400">URL:</span>{' '}
                          <span className="text-blue-400">
                            {effective.satellitePageBlueprint.suggestedUrl}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">Type:</span>{' '}
                          <span className="text-gray-300">
                            {effective.satellitePageBlueprint.pageType}
                          </span>
                          <span className="ml-2 text-gray-400">Words:</span>{' '}
                          <span className="text-gray-300">
                            {effective.satellitePageBlueprint.targetWordCount}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">H1:</span>{' '}
                          <span className="text-gray-300">
                            {effective.satellitePageBlueprint.h1}
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-400">Key Sections:</span>
                          <ul className="ml-3 list-disc text-gray-300">
                            {effective.satellitePageBlueprint.keySections.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        {effective.satellitePageBlueprint.brandsToCompare &&
                          effective.satellitePageBlueprint.brandsToCompare.length > 0 && (
                            <div>
                              <span className="text-gray-400">Brands to Compare:</span>
                              <div className="mt-1 space-y-1">
                                {effective.satellitePageBlueprint.brandsToCompare.map((b, i) => (
                                  <div key={i} className="flex gap-2 text-gray-300">
                                    <span className="font-medium">{b.brand}</span>
                                    <span className="text-gray-500">|</span>
                                    <span>{b.price}</span>
                                    <span className="text-gray-500">|</span>
                                    <span>{b.differentiator}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Success Metrics */}
                  {effective.successMetrics && effective.successMetrics.length > 0 && (
                    <div>
                      <TooltipAnchor
                        description="How to measure whether this recommendation worked — each metric paired with a specific measurement method."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Success Metrics
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 space-y-1">
                        {effective.successMetrics.map((sm, idx) => (
                          <div key={idx} className="flex gap-2 text-xs">
                            <span className="text-gray-300">{sm.metric}:</span>
                            <span className="text-gray-400">{sm.measurement}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependencies */}
                  {effective.dependencies && effective.dependencies.length > 0 && (
                    <div>
                      <TooltipAnchor
                        description="Other recommendations (by TASK/BRIEF ID) that must be completed before this one can be implemented."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Dependencies
                        </span>
                      </TooltipAnchor>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {effective.dependencies.map((d, i) => (
                          <span
                            key={i}
                            className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Prompts */}
                  {effective.targetPrompts && effective.targetPrompts.length > 0 && (
                    <div>
                      <TooltipAnchor
                        description="The specific AI prompts/queries this recommendation is designed to influence (e.g., prompts tracked in XOFU)."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Target Prompts
                        </span>
                      </TooltipAnchor>
                      <ul className="ml-3 mt-1 list-disc text-xs text-gray-300">
                        {effective.targetPrompts.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Evidence URLs */}
                  {effective.evidenceUrls && effective.evidenceUrls.length > 0 && (
                    <div>
                      <TooltipAnchor
                        description="Source URLs from the product intelligence database that support this recommendation."
                        side="top"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-600 text-xs font-medium text-gray-400">
                          Evidence URLs
                        </span>
                      </TooltipAnchor>
                      <ul className="ml-3 mt-1 list-disc text-xs">
                        {effective.evidenceUrls.map((url, i) => (
                          <li key={i} className="break-all text-blue-400">
                            {url}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Implementation Roadmap */}
      {implementationRoadmap && (
        <div className="rounded-lg border border-gray-700">
          <button
            onClick={() => setRoadmapExpanded(!roadmapExpanded)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <TooltipAnchor
              description="Phased execution plan: immediate actions (this week), short-term tasks (this month), and quarterly goals."
              side="top"
            >
              <span className="flex cursor-help items-center gap-2 text-sm font-medium text-white">
                <Map className="h-4 w-4 text-blue-400" />
                Implementation Roadmap
              </span>
            </TooltipAnchor>
            {roadmapExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {roadmapExpanded && (
            <div className="space-y-3 border-t border-gray-700 px-3 py-3 text-sm">
              {implementationRoadmap.immediateThisWeek?.length > 0 && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-red-400">
                    Immediate (This Week)
                  </span>
                  <ul className="ml-3 list-disc text-xs text-gray-300">
                    {implementationRoadmap.immediateThisWeek.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {implementationRoadmap.shortTermThisMonth?.length > 0 && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-orange-400">
                    Short-Term (This Month)
                  </span>
                  <ul className="ml-3 list-disc text-xs text-gray-300">
                    {implementationRoadmap.shortTermThisMonth.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {implementationRoadmap.quarterly?.length > 0 && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-blue-400">Quarterly</span>
                  <ul className="ml-3 list-disc text-xs text-gray-300">
                    {implementationRoadmap.quarterly.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Citation Optimization Targets */}
      {citationOptimizationTargets && citationOptimizationTargets.length > 0 && (
        <div className="rounded-lg border border-gray-700">
          <button
            onClick={() => setCitationsExpanded(!citationsExpanded)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <TooltipAnchor
              description="AI prompts/questions where the product should be cited — maps each question to its current AI source and the recommended answer location."
              side="top"
            >
              <span className="flex cursor-help items-center gap-2 text-sm font-medium text-white">
                <Eye className="h-4 w-4 text-purple-400" />
                Citation Optimization Targets ({citationOptimizationTargets.length})
              </span>
            </TooltipAnchor>
            {citationsExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {citationsExpanded && (
            <div className="space-y-2 border-t border-gray-700 px-3 py-3">
              {citationOptimizationTargets.map((ct, idx) => {
                const isLinkedSelected = selectedRecIds.has(ct.recId);
                return (
                  <div
                    key={idx}
                    className={`rounded border p-2 text-xs ${
                      isLinkedSelected
                        ? 'border-gray-600 bg-gray-800'
                        : 'border-gray-700 bg-gray-800/50 opacity-50'
                    }`}
                  >
                    <div className="mb-1 font-medium text-gray-200">{ct.question}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
                      <span>
                        AI Source: <span className="text-gray-300">{ct.currentAiSource}</span>
                      </span>
                      <span>
                        Answer Location:{' '}
                        <span className="text-gray-300">{ct.zenbusinessAnswerLocation}</span>
                      </span>
                      <span>
                        Rec:{' '}
                        <span
                          className={
                            isLinkedSelected
                              ? PRIORITY_TEXT_COLORS[
                                  recommendations.find((r) => r.recId === ct.recId)?.priorityTier ||
                                    ''
                                ] || 'text-gray-300'
                              : 'text-gray-500'
                          }
                        >
                          {ct.recId}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t border-gray-700 pt-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          className="border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600"
        >
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {selectedRecIds.size} recommendation{selectedRecIds.size !== 1 ? 's' : ''} will be
            submitted
          </span>
          <Button
            onClick={handleSubmit}
            disabled={selectedRecIds.size === 0 || isSubmitting}
            className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Submit Recommendations
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PIRRecommendationForm;
