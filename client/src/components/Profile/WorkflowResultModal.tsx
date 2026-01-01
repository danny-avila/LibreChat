import React from 'react';

interface WorkflowResultModalProps {
  show: boolean;
  result: any;
  onClose: () => void;
}

const WorkflowResultModal: React.FC<WorkflowResultModalProps> = ({ show, result, onClose }) => {
  if (!show || !result) return null;
  const { workflowName, status, timestamp, data, error } = result;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-border-light bg-surface-primary shadow-2xl">
        {/* Modal Header */}
        <div className="sticky top-0 border-b border-border-light bg-surface-primary-alt p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-text-primary">Workflow Execution Result</h3>
              <p className="mt-1 text-sm text-text-secondary">{workflowName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        {/* Modal Body */}
        <div className="p-6">
          {/* Status Badge */}
          <div className="mb-4 flex items-center gap-2">
            {status === 'success' ? (
              <div className="flex items-center gap-2 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-600">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Success
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-600">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                Error
              </div>
            )}
            <span className="text-xs text-text-secondary">{timestamp}</span>
          </div>
          {/* Result Data (summary, insights, etc.) can be slotted here if needed */}
          {status === 'success' && data && (
            <pre className="overflow-x-auto rounded bg-gray-100 p-4 text-xs">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
          {status === 'error' && error && (
            <div className="rounded bg-red-100 p-4 text-xs text-red-700">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowResultModal;
