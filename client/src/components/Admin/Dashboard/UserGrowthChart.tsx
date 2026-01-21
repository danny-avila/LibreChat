import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TimeSeriesData } from '~/types/admin';
import {
  CHART_COLORS,
  CHART_STYLES,
  formatNumber,
  formatChartDate,
  customTooltipFormatter,
} from './chartUtils';

interface UserGrowthChartProps {
  data: TimeSeriesData[];
  loading?: boolean;
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export const UserGrowthChart: React.FC<UserGrowthChartProps> = ({
  data,
  loading = false,
  granularity = 'daily',
}) => {
  // Transform data for recharts
  const chartData = data
    .filter((item) => item && item.timestamp && item.value !== undefined && item.value !== null)
    .map((item) => ({
      date: formatChartDate(item.timestamp, granularity),
      users: item.value ?? 0,
      timestamp: item.timestamp,
    }));

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-gray-500">Loading chart data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-gray-500">No data available for the selected time range</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid {...CHART_STYLES.grid} />
          <XAxis
            dataKey="date"
            {...CHART_STYLES.axis}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            {...CHART_STYLES.axis}
            tickFormatter={formatNumber}
          />
          <Tooltip
            {...CHART_STYLES.tooltip}
            formatter={customTooltipFormatter as any}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
            }}
          />
          <Line
            type="monotone"
            dataKey="users"
            name="New Users"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS.primary, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
