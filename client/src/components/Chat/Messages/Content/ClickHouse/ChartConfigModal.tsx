import React, { useState } from 'react';
import {
  Panel,
  Text,
  Separator,
  Container,
} from '@clickhouse/click-ui';
import type { ChartType, ChartConfig } from './types';
import { CHART_COLORS } from './types';
import { getColumnNames, getNumericColumns } from './chartDetect';
import { CH_BG_MUTED } from './types';

interface ChartConfigModalProps {
  rows: Record<string, unknown>[];
  initial?: ChartConfig;
  onApply: (config: ChartConfig) => void;
  onClose: () => void;
  codeTheme: 'light' | 'dark';
}

const CHART_TYPE_OPTIONS: Array<{ value: ChartType; label: string }> = [
  { value: 'bar', label: 'Bar' },
  { value: 'hbar', label: 'Horizontal Bar' },
  { value: 'sbar', label: 'Stacked Bar' },
  { value: 'shbar', label: 'Stacked H-Bar' },
  { value: 'area', label: 'Area' },
  { value: 'line', label: 'Line' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'pie', label: 'Pie' },
  { value: 'doughnut', label: 'Doughnut' },
];

export default function ChartConfigModal({
  rows,
  initial,
  onApply,
  onClose,
  codeTheme,
}: ChartConfigModalProps) {
  const allColumns = getColumnNames(rows);
  const numericColumns = getNumericColumns(rows);

  const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? 'bar');
  const [xAxis, setXAxis] = useState(initial?.xAxis ?? allColumns[0] ?? '');
  const [yAxisCols, setYAxisCols] = useState<string[]>(
    initial?.yAxis.map((y) => y.column) ?? (numericColumns.length > 0 ? [numericColumns[0]] : []),
  );
  const [title, setTitle] = useState(initial?.title ?? '');

  const toggleYCol = (col: string) => {
    setYAxisCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const handleApply = () => {
    if (!xAxis || yAxisCols.length === 0) {
      return;
    }
    onApply({
      chartType,
      xAxis,
      yAxis: yAxisCols.map((col, i) => ({
        color: CHART_COLORS[i % CHART_COLORS.length],
        column: col,
      })),
      title: title || undefined,
    });
  };

  return (
    <Panel padding="md" radii="sm" hasBorder orientation="vertical" fillWidth>
      <Container orientation="horizontal" padding="none" justifyContent="space-between" alignItems="center">
        <Text size="md" weight="bold">Chart Configuration</Text>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-sm hover:opacity-70"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          &times;
        </button>
      </Container>

      <Separator size="xs" />

      {/* Chart Type */}
      <Container orientation="vertical" padding="none" gap="xs">
        <Text size="xs" color="muted" weight="medium">Chart Type</Text>
        <div className="flex flex-wrap gap-1">
          {CHART_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChartType(opt.value)}
              className="rounded-md px-2.5 py-1 text-xs transition-colors"
              style={{
                background: chartType === opt.value ? CH_BG_MUTED[codeTheme] : 'transparent',
                border: chartType === opt.value
                  ? '1px solid var(--text-secondary)'
                  : '1px solid var(--separator-color, #e6e7e9)',
                color: chartType === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: chartType === opt.value ? 500 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Container>

      <Separator size="xs" />

      {/* X Axis */}
      <Container orientation="vertical" padding="none" gap="xs">
        <Text size="xs" color="muted" weight="medium">X Axis (categories)</Text>
        <select
          value={xAxis}
          onChange={(e) => setXAxis(e.target.value)}
          className="w-full rounded-md px-2 py-1.5 text-xs"
          style={{
            background: CH_BG_MUTED[codeTheme],
            border: '1px solid var(--separator-color, #e6e7e9)',
            color: 'var(--text-primary)',
          }}
        >
          {allColumns.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      </Container>

      {/* Y Axis */}
      <Container orientation="vertical" padding="none" gap="xs">
        <Text size="xs" color="muted" weight="medium">Y Axis (values)</Text>
        <div className="flex flex-wrap gap-1">
          {allColumns
            .filter((col) => col !== xAxis)
            .map((col) => {
              const isNumeric = numericColumns.includes(col);
              const selected = yAxisCols.includes(col);
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleYCol(col)}
                  className="rounded-md px-2.5 py-1 text-xs transition-colors"
                  style={{
                    background: selected ? CH_BG_MUTED[codeTheme] : 'transparent',
                    border: selected
                      ? '1px solid var(--text-secondary)'
                      : '1px solid var(--separator-color, #e6e7e9)',
                    color: isNumeric ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    opacity: isNumeric ? 1 : 0.5,
                    fontWeight: selected ? 500 : 400,
                  }}
                >
                  {col}
                </button>
              );
            })}
        </div>
      </Container>

      <Separator size="xs" />

      {/* Title */}
      <Container orientation="vertical" padding="none" gap="xs">
        <Text size="xs" color="muted" weight="medium">Title (optional)</Text>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chart title..."
          className="w-full rounded-md px-2 py-1.5 text-xs"
          style={{
            background: CH_BG_MUTED[codeTheme],
            border: '1px solid var(--separator-color, #e6e7e9)',
            color: 'var(--text-primary)',
          }}
        />
      </Container>

      {/* Actions */}
      <Container orientation="horizontal" padding="none" gap="sm" justifyContent="end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs transition-colors"
          style={{
            border: '1px solid var(--separator-color, #e6e7e9)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!xAxis || yAxisCols.length === 0}
          className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            border: 'none',
            background: !xAxis || yAxisCols.length === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
            color: !xAxis || yAxisCols.length === 0 ? 'var(--text-secondary)' : CH_BG_MUTED[codeTheme],
            cursor: !xAxis || yAxisCols.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Apply
        </button>
      </Container>
    </Panel>
  );
}
