/**
 * Chart utility functions and configurations for admin dashboard
 */

// Color palette for charts
export const CHART_COLORS = {
  primary: '#10a37f',
  secondary: '#6366f1',
  tertiary: '#f59e0b',
  quaternary: '#ef4444',
  quinary: '#8b5cf6',
  senary: '#ec4899',
  septenary: '#14b8a6',
  octonary: '#f97316',
};

export const ENDPOINT_COLORS: Record<string, string> = {
  openAI: CHART_COLORS.primary,
  anthropic: CHART_COLORS.secondary,
  google: CHART_COLORS.tertiary,
  azureOpenAI: CHART_COLORS.quaternary,
  gptPlugins: CHART_COLORS.quinary,
  assistants: CHART_COLORS.senary,
  bedrock: CHART_COLORS.septenary,
  other: CHART_COLORS.octonary,
};

// Common chart styles
export const CHART_STYLES = {
  tooltip: {
    contentStyle: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '8px 12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    labelStyle: {
      color: '#374151',
      fontWeight: 600,
      marginBottom: '4px',
    },
    itemStyle: {
      color: '#6b7280',
    },
  },
  grid: {
    strokeDasharray: '3 3',
    stroke: '#e5e7eb',
  },
  axis: {
    stroke: '#9ca3af',
    fontSize: 12,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
};

// Format numbers for display
export const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
};

// Format currency
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Format percentage
export const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Format date for chart labels
export const formatChartDate = (date: Date | string, granularity: 'daily' | 'weekly' | 'monthly' = 'daily'): string => {
  if (!date) {
    return 'Invalid Date';
  }
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  
  if (granularity === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  if (granularity === 'weekly') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Get responsive chart dimensions
export const getChartDimensions = (containerWidth: number) => {
  return {
    width: containerWidth,
    height: Math.min(400, Math.max(250, containerWidth * 0.4)),
  };
};

// Custom tooltip formatter
export const customTooltipFormatter = (value: number | undefined, name: string | undefined, props: any): string => {
  if (value === undefined || value === null) {
    return 'N/A';
  }
  
  // Handle undefined or null name
  if (!name || typeof name !== 'string') {
    return formatNumber(value);
  }
  
  const nameLower = name.toLowerCase();
  if (nameLower.includes('cost') || nameLower.includes('price')) {
    return formatCurrency(value);
  }
  if (nameLower.includes('percent') || nameLower.includes('rate')) {
    return formatPercentage(value);
  }
  return formatNumber(value);
};
