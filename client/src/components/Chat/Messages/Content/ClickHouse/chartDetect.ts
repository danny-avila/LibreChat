import type { ChartConfig, ChartType } from './types';
import { CHART_COLORS } from './types';

interface ColumnClassification {
  name: string;
  kind: 'string' | 'numeric' | 'date';
}

const DATE_PATTERNS = /^\d{4}-\d{2}-\d{2}/;

function classifyValue(value: unknown): 'string' | 'numeric' | 'date' {
  if (value === null || value === undefined) {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'numeric';
  }
  const str = String(value);
  if (str.length > 0 && !isNaN(Number(str))) {
    return 'numeric';
  }
  if (DATE_PATTERNS.test(str)) {
    return 'date';
  }
  return 'string';
}

function classifyColumns(rows: Record<string, unknown>[]): ColumnClassification[] {
  if (rows.length === 0) {
    return [];
  }
  const columns = Object.keys(rows[0]);
  return columns.map((name) => {
    // Sample up to 10 non-null values to determine type
    const samples = rows.slice(0, 10).map((r) => r[name]).filter((v) => v !== null && v !== undefined);
    if (samples.length === 0) {
      return { name, kind: 'string' as const };
    }
    const kinds = samples.map(classifyValue);
    // If all numeric, it's numeric. If all dates, it's date. Otherwise string.
    if (kinds.every((k) => k === 'numeric')) {
      return { name, kind: 'numeric' as const };
    }
    if (kinds.every((k) => k === 'date')) {
      return { name, kind: 'date' as const };
    }
    return { name, kind: 'string' as const };
  });
}

function makeYAxis(columns: string[]): ChartConfig['yAxis'] {
  return columns.map((col, i) => ({
    color: CHART_COLORS[i % CHART_COLORS.length],
    column: col,
  }));
}

export function autoDetectChart(rows: Record<string, unknown>[]): ChartConfig | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  const classified = classifyColumns(rows);
  const stringCols = classified.filter((c) => c.kind === 'string');
  const numericCols = classified.filter((c) => c.kind === 'numeric');
  const dateCols = classified.filter((c) => c.kind === 'date');

  // Need at least one numeric column for any chart
  if (numericCols.length === 0) {
    return null;
  }

  // 1 date + numeric(s) → area chart
  if (dateCols.length === 1 && numericCols.length >= 1) {
    return {
      chartType: numericCols.length > 3 ? 'line' : 'area',
      xAxis: dateCols[0].name,
      yAxis: makeYAxis(numericCols.map((c) => c.name)),
    };
  }

  // 1 string + 1 numeric, few rows → doughnut
  if (stringCols.length === 1 && numericCols.length === 1 && rows.length <= 8) {
    return {
      chartType: 'doughnut',
      xAxis: stringCols[0].name,
      yAxis: makeYAxis([numericCols[0].name]),
    };
  }

  // 1 string + numeric(s) → bar
  if (stringCols.length === 1 && numericCols.length >= 1) {
    return {
      chartType: 'bar',
      xAxis: stringCols[0].name,
      yAxis: makeYAxis(numericCols.map((c) => c.name)),
    };
  }

  // 2+ numeric, no string/date → scatter (first two numeric)
  if (stringCols.length === 0 && dateCols.length === 0 && numericCols.length >= 2) {
    return {
      chartType: 'scatter',
      xAxis: numericCols[0].name,
      yAxis: makeYAxis([numericCols[1].name]),
    };
  }

  return null;
}

export function getColumnNames(rows: Record<string, unknown>[]): string[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  return Object.keys(rows[0]);
}

export function getNumericColumns(rows: Record<string, unknown>[]): string[] {
  return classifyColumns(rows)
    .filter((c) => c.kind === 'numeric')
    .map((c) => c.name);
}

export function buildChartConfig(
  chartType: ChartType,
  xAxis: string,
  yAxisColumns: string[],
  title?: string,
): ChartConfig {
  return {
    chartType,
    xAxis,
    yAxis: makeYAxis(yAxisColumns),
    title,
  };
}
