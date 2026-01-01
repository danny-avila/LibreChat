import React from 'react';

export default function CEOKpiStats({ kpiStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpiStats.map((stat, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              <h3 className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</h3>
            </div>
            <div className={`rounded-lg p-2 ${stat.bg} ${stat.color}`}>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {stat.icon}
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
