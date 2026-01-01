import React from 'react';

export default function CEOProjectsTable({ projects }) {
  // Sort by deadline ascending
  const sorted = [...projects].sort((a, b) => {
    if (a.deadline && b.deadline) {
      return new Date(a.deadline) - new Date(b.deadline);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
        <h3 className="font-bold text-gray-800">🚀 Active Projects Portfolio</h3>
        <span className="font-mono text-xs text-gray-400">Sort: Deadline</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Project</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Budget</th>
              <th className="px-6 py-3 text-right">Burn Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-400">
                  No active projects data available.
                </td>
              </tr>
            ) : (
              sorted.slice(0, 5).map((p, i) => {
                const budget = p.budget || 0;
                const spent = p.spent || 0;
                const burn = budget > 0 ? (spent / budget) * 100 : 0;
                return (
                  <tr key={i} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{p.name || 'Untitled'}</div>
                      <div className="text-xs text-gray-400">{p.projectId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {p.status || 'unknown'}
                      </span>
                    </td>
                    <td className="w-1/3 px-6 py-4">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-gray-500">${spent.toLocaleString()}</span>
                        <span className="font-bold text-gray-700">
                          ${budget.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-200">
                        <div
                          className={`h-1.5 rounded-full ${burn > 100 ? 'bg-red-500' : burn > 80 ? 'bg-orange-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.min(burn, 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-bold ${burn > 100 ? 'text-red-600' : 'text-gray-700'}`}
                    >
                      {burn.toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
