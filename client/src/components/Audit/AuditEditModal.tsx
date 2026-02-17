import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEditReport } from '~/data-provider/audit-queries';
import type { AuditReport, PainPoint, Recommendation } from '~/types/audit';

interface AuditEditModalProps {
  sessionId: string;
  report: AuditReport;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuditEditModal: React.FC<AuditEditModalProps> = ({
  sessionId,
  report,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [quickWins, setQuickWins] = useState<string[]>([]);
  const [longTermInitiatives, setLongTermInitiatives] = useState<string[]>([]);
  const [roiHoursSaved, setRoiHoursSaved] = useState('');
  const [roiCostEquivalent, setRoiCostEquivalent] = useState('');
  const [roiNotes, setRoiNotes] = useState('');
  const [changeNotes, setChangeNotes] = useState('');

  const editMutation = useEditReport();

  // Populate form when modal opens
  useEffect(() => {
    if (isOpen && report) {
      setExecutiveSummary(report.executiveSummary || '');
      setPainPoints(report.painPoints ? [...report.painPoints] : []);
      setRecommendations(report.recommendations ? [...report.recommendations] : []);
      setQuickWins(
        (report.quickWins || []).map((w: any) => (typeof w === 'string' ? w : w.action || '')),
      );
      setLongTermInitiatives(
        (report.longTermInitiatives || []).map((i: any) =>
          typeof i === 'string' ? i : i.initiative || '',
        ),
      );
      setRoiHoursSaved(report.estimatedROI?.hours_saved || '');
      setRoiCostEquivalent(report.estimatedROI?.cost_equivalent || '');
      setRoiNotes(report.estimatedROI?.additional_notes || '');
      setChangeNotes('');
    }
  }, [isOpen, report]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeNotes.trim()) return;

    try {
      await editMutation.mutateAsync({
        sessionId,
        reportData: {
          executiveSummary,
          painPoints,
          recommendations,
          quickWins,
          longTermInitiatives,
          estimatedROI: {
            hours_saved: roiHoursSaved,
            cost_equivalent: roiCostEquivalent,
            additional_notes: roiNotes || undefined,
          },
          changeNotes: changeNotes.trim(),
        },
      });
      onSuccess?.();
      onClose();
    } catch {
      // error displayed below
    }
  };

  // --- Pain Points helpers ---
  const updatePainPoint = (index: number, field: keyof PainPoint, value: string) => {
    setPainPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const addPainPoint = () => {
    setPainPoints((prev) => [
      ...prev,
      {
        category: '',
        title: '',
        description: '',
        severity: 'medium',
        current_time_spent: '',
        business_impact: '',
      },
    ]);
  };
  const removePainPoint = (index: number) => {
    setPainPoints((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Recommendations helpers ---
  const updateRec = (index: number, field: keyof Recommendation, value: any) => {
    setRecommendations((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const addRecommendation = () => {
    setRecommendations((prev) => [
      ...prev,
      {
        title: '',
        description: '',
        priority: 'medium',
        implementation_complexity: 'moderate',
        estimated_timeline: '',
        expected_impact: '',
        tools_or_approaches: [],
      },
    ]);
  };
  const removeRecommendation = (index: number) => {
    setRecommendations((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Quick Wins helpers ---
  const updateQuickWin = (index: number, value: string) => {
    setQuickWins((prev) => prev.map((w, i) => (i === index ? value : w)));
  };
  const addQuickWin = () => setQuickWins((prev) => [...prev, '']);
  const removeQuickWin = (index: number) => setQuickWins((prev) => prev.filter((_, i) => i !== index));

  // --- Long Term helpers ---
  const updateLongTerm = (index: number, value: string) => {
    setLongTermInitiatives((prev) => prev.map((item, i) => (i === index ? value : item)));
  };
  const addLongTerm = () => setLongTermInitiatives((prev) => [...prev, '']);
  const removeLongTerm = (index: number) =>
    setLongTermInitiatives((prev) => prev.filter((_, i) => i !== index));

  const inputCls =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400';
  const selectCls =
    'rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400';
  const sectionCls =
    'rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Report</h2>
          <button
            onClick={onClose}
            disabled={editMutation.isPending}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
            {/* Executive Summary */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Executive Summary
              </label>
              <textarea
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                rows={5}
                className={inputCls}
                disabled={editMutation.isPending}
              />
            </div>

            {/* Pain Points */}
            <div className={sectionCls}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Pain Points ({painPoints.length})
                </h3>
                <button
                  type="button"
                  onClick={addPainPoint}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
              <div className="space-y-4">
                {painPoints.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        #{i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePainPoint(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Title</label>
                        <input
                          type="text"
                          value={p.title}
                          onChange={(e) => updatePainPoint(i, 'title', e.target.value)}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Category</label>
                        <input
                          type="text"
                          value={p.category}
                          onChange={(e) => updatePainPoint(i, 'category', e.target.value)}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Description</label>
                        <textarea
                          value={p.description}
                          onChange={(e) => updatePainPoint(i, 'description', e.target.value)}
                          rows={2}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Severity</label>
                        <select
                          value={p.severity}
                          onChange={(e) => updatePainPoint(i, 'severity', e.target.value)}
                          className={selectCls}
                          disabled={editMutation.isPending}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Time Spent</label>
                        <input
                          type="text"
                          value={p.current_time_spent}
                          onChange={(e) => updatePainPoint(i, 'current_time_spent', e.target.value)}
                          className={inputCls}
                          placeholder="e.g. 10 hours/week"
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Business Impact</label>
                        <input
                          type="text"
                          value={p.business_impact}
                          onChange={(e) => updatePainPoint(i, 'business_impact', e.target.value)}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {painPoints.length === 0 && (
                  <p className="text-center text-xs text-gray-400">No pain points. Click Add to create one.</p>
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className={sectionCls}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Recommendations ({recommendations.length})
                </h3>
                <button
                  type="button"
                  onClick={addRecommendation}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
              <div className="space-y-4">
                {recommendations.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        #{i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecommendation(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className={labelCls}>Title</label>
                        <input
                          type="text"
                          value={r.title}
                          onChange={(e) => updateRec(i, 'title', e.target.value)}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Description</label>
                        <textarea
                          value={r.description}
                          onChange={(e) => updateRec(i, 'description', e.target.value)}
                          rows={2}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Priority</label>
                        <select
                          value={r.priority}
                          onChange={(e) => updateRec(i, 'priority', e.target.value)}
                          className={selectCls}
                          disabled={editMutation.isPending}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Complexity</label>
                        <select
                          value={r.implementation_complexity}
                          onChange={(e) => updateRec(i, 'implementation_complexity', e.target.value)}
                          className={selectCls}
                          disabled={editMutation.isPending}
                        >
                          <option value="easy">Easy</option>
                          <option value="moderate">Moderate</option>
                          <option value="complex">Complex</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Timeline</label>
                        <input
                          type="text"
                          value={r.estimated_timeline}
                          onChange={(e) => updateRec(i, 'estimated_timeline', e.target.value)}
                          className={inputCls}
                          placeholder="e.g. 2 weeks"
                          disabled={editMutation.isPending}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Expected Impact</label>
                        <input
                          type="text"
                          value={r.expected_impact}
                          onChange={(e) => updateRec(i, 'expected_impact', e.target.value)}
                          className={inputCls}
                          disabled={editMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {recommendations.length === 0 && (
                  <p className="text-center text-xs text-gray-400">
                    No recommendations. Click Add to create one.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Wins */}
            <div className={sectionCls}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Quick Wins ({quickWins.length})
                </h3>
                <button
                  type="button"
                  onClick={addQuickWin}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
              <div className="space-y-2">
                {quickWins.map((w, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={w}
                      onChange={(e) => updateQuickWin(i, e.target.value)}
                      className={inputCls}
                      placeholder={`Quick win ${i + 1}`}
                      disabled={editMutation.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => removeQuickWin(i)}
                      className="shrink-0 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {quickWins.length === 0 && (
                  <p className="text-center text-xs text-gray-400">No quick wins yet.</p>
                )}
              </div>
            </div>

            {/* Long Term Initiatives */}
            <div className={sectionCls}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Long-Term Initiatives ({longTermInitiatives.length})
                </h3>
                <button
                  type="button"
                  onClick={addLongTerm}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
              <div className="space-y-2">
                {longTermInitiatives.map((item, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateLongTerm(i, e.target.value)}
                      className={inputCls}
                      placeholder={`Initiative ${i + 1}`}
                      disabled={editMutation.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => removeLongTerm(i)}
                      className="shrink-0 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {longTermInitiatives.length === 0 && (
                  <p className="text-center text-xs text-gray-400">No initiatives yet.</p>
                )}
              </div>
            </div>

            {/* Estimated ROI */}
            <div className={sectionCls}>
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Estimated ROI
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Hours Saved</label>
                  <input
                    type="text"
                    value={roiHoursSaved}
                    onChange={(e) => setRoiHoursSaved(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. 500 hours/year"
                    disabled={editMutation.isPending}
                  />
                </div>
                <div>
                  <label className={labelCls}>Cost Equivalent</label>
                  <input
                    type="text"
                    value={roiCostEquivalent}
                    onChange={(e) => setRoiCostEquivalent(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. £25,000 annual value"
                    disabled={editMutation.isPending}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Additional Notes</label>
                  <input
                    type="text"
                    value={roiNotes}
                    onChange={(e) => setRoiNotes(e.target.value)}
                    className={inputCls}
                    disabled={editMutation.isPending}
                  />
                </div>
              </div>
            </div>

            {/* Change Notes (required) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Change Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                rows={3}
                placeholder="Describe what you changed and why..."
                className={inputCls}
                required
                disabled={editMutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Required. This will be stored in version history.
              </p>
            </div>

            {/* Error */}
            {editMutation.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-400">
                  Failed to save report
                </p>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                  {(editMutation.error as Error)?.message || 'An unexpected error occurred'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={editMutation.isPending}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editMutation.isPending || !changeNotes.trim()}
              className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {editMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuditEditModal;
