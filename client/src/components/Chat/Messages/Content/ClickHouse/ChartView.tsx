import React, { useMemo } from 'react';
import { XYChart, PieChart, DonutChart } from '@clickhouse/viz-house';
import type { XYSeriesDescriptor, XYChartValue, PieSeriesDescriptor, PieChartValue } from '@clickhouse/viz-house';
import type { ChartConfig } from './types';

interface ChartViewProps {
  rows: Record<string, unknown>[];
  chartConfig: ChartConfig;
  codeTheme: 'light' | 'dark';
}

// ---- Chart type helpers ----

const isPieType = (t: string): boolean => t === 'pie' || t === 'doughnut';
const isFlipped = (t: string): boolean => t === 'hbar' || t === 'shbar';
const isStacked = (t: string): boolean => t === 'sbar' || t === 'shbar';

function getSeriesType(chartType: string): XYSeriesDescriptor['type'] {
  switch (chartType) {
    case 'area':
      return 'area';
    case 'bar':
    case 'sbar':
      return 'column';
    case 'hbar':
    case 'shbar':
      return 'bar';
    case 'scatter':
      return 'scatter';
    default:
      return 'line';
  }
}

// ---- Transforms ----

function transformForXY(
  rows: Record<string, unknown>[],
  config: ChartConfig,
): { series: XYSeriesDescriptor[]; stacked: boolean } {
  const flipped = isFlipped(config.chartType);
  const indepCol = flipped ? config.yAxis[0]?.column : config.xAxis;
  const depItems = flipped
    ? [{ column: config.xAxis, color: config.yAxis[0]?.color ?? '#f97316' }]
    : config.yAxis;

  const series: XYSeriesDescriptor[] = (depItems ?? []).map((item) => {
    const values: XYChartValue[] = rows.map((row) => {
      const rawX = String(row[indepCol ?? ''] ?? '');
      const rawY = row[item.column];
      return { x: rawX, y: parseFloat(String(rawY ?? 0)) };
    });

    return {
      name: item.column,
      type: getSeriesType(config.chartType),
      values,
      color: item.color,
    };
  });

  return { series, stacked: isStacked(config.chartType) };
}

function transformForPie(
  rows: Record<string, unknown>[],
  config: ChartConfig,
): PieSeriesDescriptor[] {
  const catCol = config.xAxis;
  const valCol = config.yAxis[0]?.column;
  if (!catCol || !valCol) {
    return [];
  }

  const values: PieChartValue[] = rows.map((row) => ({
    name: String(row[catCol] ?? ''),
    y: parseFloat(String(row[valCol] ?? 0)),
  }));

  return [{ name: valCol, values }];
}

export default function ChartView({ rows, chartConfig, codeTheme }: ChartViewProps) {
  const chartType = chartConfig.chartType ?? 'bar';

  const pieData = useMemo(
    () => (isPieType(chartType) ? transformForPie(rows, chartConfig) : null),
    [rows, chartConfig, chartType],
  );

  const xyData = useMemo(
    () => (isPieType(chartType) ? null : transformForXY(rows, chartConfig)),
    [rows, chartConfig, chartType],
  );

  if (isPieType(chartType)) {
    if (!pieData || pieData.length === 0) {
      return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Cannot render chart with this data</div>;
    }
    const props = {
      series: pieData,
      width: '100%',
      height: '300px',
      title: chartConfig.title ?? '',
      legendPosition: 'bottom' as const,
    };
    return chartType === 'doughnut' ? <DonutChart {...props} /> : <PieChart {...props} />;
  }

  if (!xyData || xyData.series.length === 0) {
    return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Cannot render chart with this data</div>;
  }

  return (
    <XYChart
      series={xyData.series}
      stacked={xyData.stacked}
      title={chartConfig.title ?? ''}
      xAxis={{ type: 'category', title: '' }}
      yAxis={{ title: '' }}
      legendPosition="bottom"
      height="300px"
      highChartsPropsOverrides={{
        legend: { padding: 0 },
        plotOptions: { column: { maxPointWidth: 16 } },
        time: { useUTC: false },
        xAxis: { labels: { style: { fontSize: '11px' } }, tickLength: 0 },
        yAxis: { endOnTick: false, maxPadding: 0, labels: { style: { fontSize: '11px' } } },
      }}
    />
  );
}
