import React from 'react';
import {
  AreaChart,
  Area,
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

interface ConversationActivityChartProps {
  data: TimeSeriesData[];
  loading?: boolean;
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export const ConversationActivityChart: React.FC<ConversationActivityChartProps> = ({
  data,
  loading = false,
  granularity = 'daily',
}) => {
  // Transform data for recharts
  const chartData = data
    .filter((item) => item && item.timestamp && item.value !== undefined && item.value !== null)
    .map((item) => ({
      date: formatChartDate(item.timestamp, granularity),
      conversations: item.value ?? 0,
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
        <div className="text-gray-500">No conversation data available</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.8} />
              <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0.1} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="conversations"
            name="Conversations Created"
            stroke={CHART_COLORS.secondary}
            strokeWidth={2}
            fill="url(#colorConversations)"
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
