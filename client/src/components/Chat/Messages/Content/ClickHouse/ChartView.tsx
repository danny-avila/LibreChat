import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartConfig } from './types';
import { CHART_COLORS } from './types';

interface ChartViewProps {
  rows: Record<string, unknown>[];
  chartConfig: ChartConfig;
  codeTheme: 'light' | 'dark';
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') {
    return val;
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export default function ChartView({ rows, chartConfig, codeTheme }: ChartViewProps) {
  const { chartType, xAxis, yAxis, title } = chartConfig;
  const textColor = codeTheme === 'dark' ? '#b3b6bd' : '#696e79';
  const gridColor = codeTheme === 'dark' ? '#323232' : '#e6e7e9';
  const tooltipBg = codeTheme === 'dark' ? '#282828' : '#ffffff';
  const tooltipBorder = codeTheme === 'dark' ? '#3a3a3a' : '#e0e0e0';
  const tooltipStyle = { backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, color: textColor, fontSize: 12 };
  const labelColor = codeTheme === 'dark' ? '#ffffff' : '#1a1a1a';

  // Transform rows into recharts-friendly format
  const data = useMemo(
    () =>
      rows.map((row) => {
        const point: Record<string, unknown> = { [xAxis]: row[xAxis] };
        for (const y of yAxis) {
          point[y.column] = toNumber(row[y.column]);
        }
        return point;
      }),
    [rows, xAxis, yAxis],
  );

  const isPie = chartType === 'pie' || chartType === 'doughnut';
  const isHorizontal = chartType === 'hbar' || chartType === 'shbar';
  const isStacked = chartType === 'sbar' || chartType === 'shbar';
  const isScatter = chartType === 'scatter';
  const isArea = chartType === 'area';
  const isLine = chartType === 'line';

  if (data.length === 0) {
    return (
      <div style={{ padding: 16, color: textColor }}>No data to chart</div>
    );
  }

  // Pie / Doughnut
  if (isPie) {
    const valCol = yAxis[0]?.column;
    if (!valCol) {
      return null;
    }
    const pieData = data.map((d) => ({
      name: String(d[xAxis] ?? ''),
      value: toNumber(d[valCol]),
    }));

    return (
      <div>
        {title && (
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: textColor, marginBottom: 4 }}>
            {title}
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={chartType === 'doughnut' ? 60 : 0}
              outerRadius={100}
              label={({ name, percent, x, y, textAnchor }) => (
                <text x={x} y={y} textAnchor={textAnchor} fill={textColor} fontSize={11}>
                  {`${name} ${(percent * 100).toFixed(0)}%`}
                </text>
              )}
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: labelColor }} />
            <Legend wrapperStyle={{ fontSize: 12, color: textColor }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Scatter
  if (isScatter) {
    const yCol = yAxis[0]?.column;
    if (!yCol) {
      return null;
    }
    const scatterData = data.map((d) => ({
      x: toNumber(d[xAxis]),
      y: toNumber(d[yCol]),
    }));

    return (
      <div>
        {title && (
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: textColor, marginBottom: 4 }}>
            {title}
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="x" name={xAxis} tick={{ fontSize: 11, fill: textColor }} />
            <YAxis dataKey="y" name={yCol} tick={{ fontSize: 11, fill: textColor }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: labelColor }} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={scatterData} fill={yAxis[0]?.color ?? CHART_COLORS[0]} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Bar (vertical / horizontal / stacked)
  if (!isArea && !isLine) {
    const ChartComponent = BarChart;
    return (
      <div>
        {title && (
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: textColor, marginBottom: 4 }}>
            {title}
          </div>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent
            data={data}
            layout={isHorizontal ? 'vertical' : 'horizontal'}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            {isHorizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 11, fill: textColor }} />
                <YAxis dataKey={xAxis} type="category" tick={{ fontSize: 11, fill: textColor }} width={100} />
              </>
            ) : (
              <>
                <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: textColor }} />
                <YAxis tick={{ fontSize: 11, fill: textColor }} />
              </>
            )}
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: labelColor }} />
            {yAxis.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: textColor }} />}
            {yAxis.map((y, i) => (
              <Bar
                key={y.column}
                dataKey={y.column}
                fill={y.color || CHART_COLORS[i % CHART_COLORS.length]}
                stackId={isStacked ? 'stack' : undefined}
                maxBarSize={40}
              />
            ))}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    );
  }

  // Area / Line
  const ChartComponent = isArea ? AreaChart : LineChart;
  return (
    <div>
      {title && (
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: textColor, marginBottom: 4 }}>
          {title}
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey={xAxis} tick={{ fontSize: 11, fill: textColor }} />
          <YAxis tick={{ fontSize: 11, fill: textColor }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: labelColor }} />
          {yAxis.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: textColor }} />}
          {yAxis.map((y, i) => {
            const color = y.color || CHART_COLORS[i % CHART_COLORS.length];
            return isArea ? (
              <Area
                key={y.column}
                type="monotone"
                dataKey={y.column}
                stroke={color}
                fill={color}
                fillOpacity={0.3}
              />
            ) : (
              <Line
                key={y.column}
                type="monotone"
                dataKey={y.column}
                stroke={color}
                dot={false}
              />
            );
          })}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
