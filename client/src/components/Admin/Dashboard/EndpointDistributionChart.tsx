import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { EndpointBreakdown } from '~/types/admin';
import {
  ENDPOINT_COLORS,
  CHART_STYLES,
  formatPercentage,
} from './chartUtils';

interface EndpointDistributionChartProps {
  data: EndpointBreakdown[];
  loading?: boolean;
}

export const EndpointDistributionChart: React.FC<EndpointDistributionChartProps> = ({
  data,
  loading = false,
}) => {
  // Transform data for pie chart
  const chartData = data
    .filter((item) => item && item.endpoint)
    .map((item) => ({
      name: item.endpoint || 'Unknown',
      value: item.count ?? 0,
      percentage: item.percentage ?? 0,
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
        <div className="text-gray-500">No endpoint distribution data available</div>
      </div>
    );
  }

  // Get color for endpoint
  const getEndpointColor = (endpoint: string): string => {
    return ENDPOINT_COLORS[endpoint] || ENDPOINT_COLORS.other;
  };

  // Custom label renderer
  const renderCustomLabel = (entry: any) => {
    return `${entry.name}: ${formatPercentage(entry.percentage)}`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length && payload[0]?.payload) {
      const data = payload[0].payload;
      return (
        <div
          style={CHART_STYLES.tooltip.contentStyle}
          className="rounded-lg border bg-white p-3 shadow-lg"
        >
          <p className="font-semibold text-gray-900">{data.name || 'Unknown'}</p>
          <p className="text-sm text-gray-600">
            Count: <span className="font-medium">{(data.value ?? 0).toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-600">
            Percentage: <span className="font-medium">{formatPercentage(data.percentage ?? 0)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getEndpointColor(entry.name)}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{
              paddingTop: '20px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
