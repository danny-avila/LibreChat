import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { EndpointTokenUsage } from '~/types/admin';
import {
  ENDPOINT_COLORS,
  CHART_STYLES,
  formatNumber,
  customTooltipFormatter,
} from './chartUtils';

interface TokenUsageChartProps {
  data: EndpointTokenUsage[];
  loading?: boolean;
}

export const TokenUsageChart: React.FC<TokenUsageChartProps> = ({
  data,
  loading = false,
}) => {
  // Transform data for stacked bar chart
  const chartData = data
    .filter((item) => item && item.endpoint)
    .map((item) => ({
      endpoint: item.endpoint || 'Unknown',
      tokens: item.tokens ?? 0,
      cost: item.cost ?? 0,
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
        <div className="text-gray-500">No token usage data available</div>
      </div>
    );
  }

  // Get color for endpoint
  const getEndpointColor = (endpoint: string): string => {
    return ENDPOINT_COLORS[endpoint] || ENDPOINT_COLORS.other;
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid {...CHART_STYLES.grid} />
          <XAxis
            dataKey="endpoint"
            {...CHART_STYLES.axis}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            {...CHART_STYLES.axis}
            tickFormatter={formatNumber}
            label={{
              value: 'Tokens',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle' },
            }}
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
          <Bar
            dataKey="tokens"
            name="Token Usage"
            fill={ENDPOINT_COLORS.openAI}
            radius={[8, 8, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Bar
                key={`bar-${index}`}
                fill={getEndpointColor(entry.endpoint)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
