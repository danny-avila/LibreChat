export interface ClickHouseToolCallProps {
  input: string;
  output?: string | null;
  functionName?: string;
}

export interface ParsedInput {
  query?: string;
  params: Record<string, string>;
}

export interface QueryMetrics {
  elapsed?: number;
  rowsRead?: number;
  bytesRead?: number;
  totalRows?: number;
}

export interface CostData {
  grandTotalCHC: number;
  costs: CostEntry[];
}

export type ChartType = 'bar' | 'hbar' | 'sbar' | 'shbar' | 'doughnut' | 'pie' | 'area' | 'line' | 'scatter';

export const CHART_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export interface ChartConfig {
  chartType: ChartType;
  xAxis: string;
  yAxis: Array<{ color: string; column: string }>;
  title?: string;
}

export interface ParsedOutput {
  error: boolean;
  errorMessage?: string;
  idleMessage?: string;
  rows?: Record<string, unknown>[];
  keyValue?: Record<string, unknown>;
  costData?: CostData;
  chartConfig?: ChartConfig;
  metrics?: QueryMetrics;
  raw: string;
}

export interface CostEntry {
  date: string;
  entityName: string;
  entityType: string;
  entityId: string;
  totalCHC: number;
  metrics: Record<string, number>;
  [key: string]: unknown;
}

export const CH_BG = { light: '#ffffff', dark: '#1f1f1c' } as const;
export const CH_BG_MUTED = { light: '#f6f7fa', dark: '#282828' } as const;

export const SQL_VALUE_KEYS = new Set(['create_table_query', 'engine_full']);
export const MAX_ROWS_PER_PAGE = 50;
