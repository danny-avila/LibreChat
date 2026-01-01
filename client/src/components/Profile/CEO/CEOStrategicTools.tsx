import React from 'react';

export default function CEOStrategicTools({ profile, executingId, activeReport, handleExecuteWorkflow }) {
  return (
    <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-lg font-bold text-gray-800">⚡ Strategic Tools</h3>
      <p className="mb-4 text-xs text-gray-500">AI-powered analysis modules.</p>
      <div className="space-y-3">
        {profile?.allowedWorkflows?.map((wf, idx) => (
          <button
            key={idx}
            onClick={() => handleExecuteWorkflow(wf)}
            disabled={executingId === wf.workflowId}
            className={`group relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${activeReport?.title === wf.workflowName ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-md'}`}
          >
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 group-hover:text-blue-700">
                {wf.workflowName}
              </span>
              {executingId === wf.workflowId ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <span className="text-gray-300 group-hover:text-blue-500">➔</span>
              )}
            </div>
            <p className="relative z-10 mt-1 pr-6 text-xs text-gray-500">
              {wf.description || 'Generate deep insights.'}
            </p>
            {executingId === wf.workflowId && (
              <div className="duration-[2000ms] absolute bottom-0 left-0 h-1 w-full animate-pulse bg-blue-500 transition-all"></div>
            )}
          </button>
        ))}
        {(!profile?.allowedWorkflows || profile.allowedWorkflows.length === 0) && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
            <span className="text-2xl">🔒</span>
            <p className="mt-2 text-xs text-gray-400">No tools configured.</p>
          </div>
        )}
      </div>
    </div>
  );
}
