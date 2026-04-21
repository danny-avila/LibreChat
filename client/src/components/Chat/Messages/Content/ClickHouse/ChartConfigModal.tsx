import React, { useState } from 'react';
import type { ChartType, ChartConfig } from './types';
import { CHART_COLORS } from './types';
import { getColumnNames, getNumericColumns } from './chartDetect';

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

  const bg = codeTheme === 'dark' ? '#282828' : '#f6f7fa';
  const border = codeTheme === 'dark' ? '#3a3a3a' : '#e0e0e0';
  const text = codeTheme === 'dark' ? '#ffffff' : '#1a1a1a';
  const muted = codeTheme === 'dark' ? '#999' : '#666';

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: text,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Chart Configuration</span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 18 }}
        >
          &times;
        </button>
      </div>

      {/* Chart Type */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, color: muted, fontSize: 11, fontWeight: 500 }}>
          Chart Type
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CHART_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChartType(opt.value)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: `1px solid ${chartType === opt.value ? '#3b82f6' : border}`,
                background: chartType === opt.value ? (codeTheme === 'dark' ? '#1e3a5f' : '#dbeafe') : 'transparent',
                color: text,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* X Axis */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, color: muted, fontSize: 11, fontWeight: 500 }}>
          X Axis (categories)
        </label>
        <select
          value={xAxis}
          onChange={(e) => setXAxis(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: codeTheme === 'dark' ? '#1f1f1c' : '#ffffff',
            color: text,
            fontSize: 12,
          }}
        >
          {allColumns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </div>

      {/* Y Axis */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, color: muted, fontSize: 11, fontWeight: 500 }}>
          Y Axis (values) — select numeric columns
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${selected ? '#3b82f6' : border}`,
                    background: selected ? (codeTheme === 'dark' ? '#1e3a5f' : '#dbeafe') : 'transparent',
                    color: isNumeric ? text : muted,
                    cursor: 'pointer',
                    fontSize: 12,
                    opacity: isNumeric ? 1 : 0.5,
                  }}
                >
                  {col}
                </button>
              );
            })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label style={{ display: 'block', marginBottom: 4, color: muted, fontSize: 11, fontWeight: 500 }}>
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chart title..."
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: codeTheme === 'dark' ? '#1f1f1c' : '#ffffff',
            color: text,
            fontSize: 12,
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: 'transparent',
            color: muted,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!xAxis || yAxisCols.length === 0}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: 'none',
            background: !xAxis || yAxisCols.length === 0 ? '#555' : '#3b82f6',
            color: '#ffffff',
            cursor: !xAxis || yAxisCols.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
