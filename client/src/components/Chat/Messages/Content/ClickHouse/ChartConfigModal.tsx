import React, { useState } from 'react';
import {
  Button,
  ButtonGroup,
  Select,
  TextField,
  Panel,
  Text,
  Separator,
  Container,
} from '@clickhouse/click-ui';
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

const CHART_TYPE_OPTIONS = [
  { value: 'bar', label: 'Bar' },
  { value: 'hbar', label: 'H-Bar' },
  { value: 'sbar', label: 'Stacked' },
  { value: 'shbar', label: 'Stacked H' },
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
}: ChartConfigModalProps) {
  const allColumns = getColumnNames(rows);
  const numericColumns = getNumericColumns(rows);

  const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? 'bar');
  const [xAxis, setXAxis] = useState(initial?.xAxis ?? allColumns[0] ?? '');
  const [yAxisCols, setYAxisCols] = useState<Set<string>>(
    new Set(initial?.yAxis.map((y) => y.column) ?? (numericColumns.length > 0 ? [numericColumns[0]] : [])),
  );
  const [title, setTitle] = useState(initial?.title ?? '');

  const handleApply = () => {
    if (!xAxis || yAxisCols.size === 0) {
      return;
    }
    onApply({
      chartType,
      xAxis,
      yAxis: Array.from(yAxisCols).map((col, i) => ({
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
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
        >
          &times;
        </button>
      </Container>

      <Separator size="xs" />

      <Container orientation="vertical" padding="none" gap="sm">
        <Text size="xs" color="muted" weight="medium">Chart Type</Text>
        <ButtonGroup
          options={CHART_TYPE_OPTIONS}
          selected={chartType}
          onClick={(value) => setChartType(value as ChartType)}
        />
      </Container>

      <Separator size="xs" />

      <Container orientation="vertical" padding="none" gap="sm">
        <Text size="xs" color="muted" weight="medium">X Axis</Text>
        <Select value={xAxis} onSelect={(value) => setXAxis(value)}>
          {allColumns.map((col) => (
            <Select.Item key={col} value={col}>
              {col}
            </Select.Item>
          ))}
        </Select>
      </Container>

      <Container orientation="vertical" padding="none" gap="sm">
        <Text size="xs" color="muted" weight="medium">Y Axis</Text>
        <ButtonGroup
          options={allColumns
            .filter((col) => col !== xAxis)
            .map((col) => ({
              value: col,
              label: col,
              disabled: !numericColumns.includes(col),
            }))}
          selected={yAxisCols}
          onClick={(value, selected) => setYAxisCols(selected instanceof Set ? selected : new Set([selected]))}
          multiple
        />
      </Container>

      <Separator size="xs" />

      <Container orientation="vertical" padding="none" gap="sm">
        <Text size="xs" color="muted" weight="medium">Title (optional)</Text>
        <TextField
          value={title}
          onChange={(val) => setTitle(val)}
          placeholder="Chart title..."
        />
      </Container>

      <Container orientation="horizontal" padding="none" gap="sm" justifyContent="end">
        <Button type="secondary" label="Cancel" onClick={onClose} />
        <Button type="primary" label="Apply" onClick={handleApply} disabled={!xAxis || yAxisCols.size === 0} />
      </Container>
    </Panel>
  );
}
