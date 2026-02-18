import React from 'react';

interface SignageOrdersStats {
  ordersToday: number;
  revenueToday: number;
  outstanding: number;
  totalOrders: number;
  statusCounts: {
    pending: number;
    printing: number;
    completed: number;
  };
}

interface Props {
  stats: SignageOrdersStats;
  onViewAll: () => void;
}

export default function CEOSignageOrdersWidget({ stats, onViewAll }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Signage Orders</h3>
          <button
            onClick={onViewAll}
            className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            View All →
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Quick Stats Grid */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-600">Orders Today</div>
            <div className="mt-1 text-2xl font-bold text-blue-900">{stats.ordersToday}</div>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <div className="text-sm font-medium text-green-600">Revenue Today</div>
            <div className="mt-1 text-2xl font-bold text-green-900">
              ${stats.revenueToday.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg bg-orange-50 p-4">
            <div className="text-sm font-medium text-orange-600">Outstanding</div>
            <div className="mt-1 text-2xl font-bold text-orange-900">
              ${stats.outstanding.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <div className="text-sm font-medium text-purple-600">Total Orders</div>
            <div className="mt-1 text-2xl font-bold text-purple-900">{stats.totalOrders}</div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Order Status</h4>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-400"></div>
              <span className="text-sm text-gray-600">Pending Approval</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.statusCounts.pending}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-400"></div>
              <span className="text-sm text-gray-600">Printing</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.statusCounts.printing}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-400"></div>
              <span className="text-sm text-gray-600">Completed</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{stats.statusCounts.completed}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
