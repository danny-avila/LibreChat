import React from 'react';

export default function WorkflowResultView({ result }: { result: any }) {
  const { data, summary, insights } = result;

  // Helper untuk format uang (biar ga ribet ngetik berkali-kali)
  const formatMoney = (val: number) => {
    if (!val) return '$0';
    if (val > 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val > 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <div className="space-y-8">
      {/* 1. EXECUTIVE NARRATIVE (Cerita Data) */}
      <div className="rounded-r-xl border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-white p-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-purple-900">
          <span className="text-xl">🤖</span> AI Executive Summary
        </h3>
        <p className="text-lg font-medium leading-relaxed text-gray-800">
          {summary || 'Analysis completed. Review the metrics below.'}
        </p>
      </div>

      {/* 2. KEY INSIGHTS (Bullet Points) */}
      {insights && insights.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-xs font-bold uppercase text-gray-500">Key Takeaways</h4>
          <div className="space-y-3">
            {insights.map((insight: string, idx: number) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">
                  ✓
                </div>
                <span className="text-sm text-gray-700">{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. FINANCIAL KPI CARDS (Big Numbers) */}
      {data?.revenue !== undefined && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <p className="text-xs font-bold uppercase text-gray-400">Total Revenue</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{formatMoney(data.revenue)}</span>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                Actual
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <p className="text-xs font-bold uppercase text-gray-400">Net Profit</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-purple-600">{formatMoney(data.profit)}</span>
              <span className="text-sm text-gray-500">({data.profitMargin}%)</span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <p className="text-xs font-bold uppercase text-gray-400">Expenses</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-600">
                {formatMoney(data.expenses)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. VISUAL TREND CHART (CSS Only - Pengganti List Transaksi) */}
      {data?.monthlyTrend && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h4 className="font-bold text-gray-800">Trend Analysis</h4>
              <p className="text-xs text-gray-400">Monthly revenue performance</p>
            </div>
          </div>

          {/* Simple CSS Bar Chart */}
          <div className="flex h-40 items-end justify-around gap-2 border-b border-gray-100 pb-2">
            {data.monthlyTrend.map((m: any, idx: number) => {
              // Hitung tinggi bar (mock max value 3M biar proporsional)
              const heightPercent = Math.min((m.revenue / 3000000) * 100, 100);
              return (
                <div key={idx} className="group flex w-full flex-col items-center gap-2">
                  <div className="relative flex h-full w-full max-w-[40px] cursor-pointer items-end overflow-hidden rounded-t-md bg-blue-50 transition-colors hover:bg-blue-100">
                    <div
                      className="w-full rounded-t-md bg-blue-500 transition-all duration-1000 group-hover:bg-blue-600"
                      style={{ height: `${heightPercent}%` }}
                    >
                      {/* Tooltip Angka */}
                      <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">
                        {formatMoney(m.revenue)}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-gray-400">
                    {m.month || `M${idx + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. DEPARTMENT PERFORMANCE (Progress Bars - Style dari Screenshot 2) */}
      {data?.departments && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h4 className="mb-6 font-bold text-gray-800">Department Metrics</h4>
          <div className="space-y-5">
            {data.departments.map((dept: any, idx: number) => {
              // Tentukan max value untuk progress bar
              const val = dept.revenue || dept.budget || 0;
              const max = 3000000; // Hardcode max untuk demo visual
              const pct = Math.min((val / max) * 100, 100);

              return (
                <div key={idx}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-bold text-gray-700">{dept.name}</span>
                    <span className="font-mono font-bold text-gray-900">{formatMoney(val)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                  <div className="mt-1 text-right text-[10px] text-gray-400">
                    {dept.revenue ? 'Revenue Target' : 'Budget Usage'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
