import React from 'react';

export default function CEOReportView({ activeReport, onClose, reportSectionRef }) {
  if (!activeReport) return null;
  return (
    <div
      ref={reportSectionRef}
      className="scroll-mt-6 duration-700 animate-in fade-in slide-in-from-top-4"
    >
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-blue-500/20">
        {/* Report Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-5 text-white">
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/20 p-2 backdrop-blur-sm">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight">{activeReport.title} Result</h3>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Generated: {activeReport.timestamp}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-all hover:bg-white/10 hover:text-white"
            title="Close Report"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Report Content Grid */}
        <div className="grid grid-cols-1 gap-8 bg-gray-50/30 p-8 lg:grid-cols-12">
          {/* --- LEFT: NARRATIVE (5 Cols) --- */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-r-xl border-l-4 border-purple-600 bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-purple-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                AI Executive Narrative
              </h4>
              <p className="text-base font-medium leading-relaxed text-gray-800">
                {activeReport.summary || 'Generating analysis...'}
              </p>
            </div>
            {activeReport.insights && activeReport.insights.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
                  Strategic Key Points
                </h4>
                <ul className="space-y-3">
                  {activeReport.insights.map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-600">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"></div>
                      <span className="leading-snug">{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* --- RIGHT: VISUALS (7 Cols) --- */}
          <div className="space-y-6 lg:col-span-7">
            {/* Visual A: FINANCIAL (3 Cards + Trend) */}
            {activeReport.metrics?.revenue !== undefined && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* Revenue Card */}
                  <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-gray-500">Revenue</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      ${(activeReport.metrics.revenue / 1000000).toFixed(1)}M
                    </p>
                    <div className="absolute bottom-2 right-2 opacity-10 transition-opacity group-hover:opacity-20">
                      <svg
                        className="h-12 w-12 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                      </svg>
                    </div>
                  </div>
                  {/* Profit Card */}
                  <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-gray-500">Net Profit</p>
                    <p className="mt-2 text-2xl font-bold text-purple-600">
                      ${(activeReport.metrics.profit / 1000000).toFixed(1)}M
                    </p>
                    <p className="text-xs font-medium text-purple-400">
                      {activeReport.metrics.profitMargin}% margin
                    </p>
                    <div className="absolute bottom-2 right-2 opacity-10 transition-opacity group-hover:opacity-20">
                      <svg
                        className="h-12 w-12 text-purple-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  {/* Expense Card */}
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase text-gray-500">Expenses</p>
                    <p className="mt-2 text-2xl font-bold text-orange-600">
                      ${(activeReport.metrics.expenses / 1000000).toFixed(1)}M
                    </p>
                  </div>
                </div>
                {/* Bar Chart CSS (Trend) */}
                {activeReport.metrics.data?.monthlyTrend && (
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex items-end justify-between">
                      <h4 className="text-sm font-bold text-gray-800">
                        Revenue Trend Analysis
                      </h4>
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
                        Q4 Performance
                      </span>
                    </div>
                    <div className="flex h-40 items-end gap-4 border-b border-gray-100 pb-2">
                      {activeReport.metrics.data.monthlyTrend.map((m, i) => {
                        const heightPct = Math.min(((m.revenue || 0) / 3000000) * 100, 100);
                        return (
                          <div
                            key={i}
                            className="group relative flex h-full flex-1 cursor-pointer flex-col justify-end"
                          >
                            {/* Tooltip */}
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                              ${((m.revenue || 0) / 1000).toFixed(0)}k
                            </div>
                            <div className="relative flex h-full w-full items-end overflow-hidden rounded-t-md bg-blue-100">
                              <div
                                className="w-full rounded-t-md bg-blue-500 transition-all duration-700 group-hover:bg-blue-600"
                                style={{ height: `${heightPct}%` }}
                              ></div>
                            </div>
                            <span className="mt-2 text-center text-[10px] font-bold uppercase text-gray-500">
                              {m.month || `P-${i + 1}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Visual B: COMPANY METRICS (Progress Bars) */}
            {activeReport.metrics?.departments && (
              <div className="h-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h4 className="mb-6 text-sm font-bold text-gray-800">Department Performance</h4>
                <div className="space-y-6">
                  {activeReport.metrics.departments.map((dept, idx) => {
                    const val = dept.revenue || dept.budget || 0;
                    const max = 3000000;
                    const pct = Math.min((val / max) * 100, 100);
                    let displayVal = `$${(val / 1000).toFixed(0)}K`;
                    let label = dept.revenue ? 'Rev' : 'Budget';
                    if (dept.employees) {
                      displayVal = `${dept.employees}`;
                      label = 'Emp';
                    }
                    return (
                      <div key={idx} className="group">
                        <div className="mb-2 flex items-end justify-between text-sm">
                          <span className="font-bold text-gray-700">{dept.name}</span>
                          <div className="text-right">
                            <span className="font-mono font-bold text-gray-900">
                              {displayVal}
                            </span>
                            <span className="ml-1 text-[10px] uppercase text-gray-400">
                              {label}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gray-800 transition-colors duration-300 group-hover:bg-purple-600"
                            style={{ width: `${dept.employees ? dept.productivity : pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
