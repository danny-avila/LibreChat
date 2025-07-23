import { useState, useEffect, useRef } from 'react';
import { BarChartIcon, ActivityLogIcon } from '@radix-ui/react-icons';
import * as echarts from 'echarts';
import { cn } from '~/utils';

interface ChartData {
  type: 'bar' | 'line';
  identifier: string;
  complexity: 'simple' | 'moderate' | 'complex';
  title: string;
  data: any;
}

const ChartToggle = ({
  onToggle,
  activeChart,
}: {
  onToggle: (type: 'bar' | 'line') => void;
  activeChart: 'bar' | 'line';
}) => {
  return (
    <div className="mb-4 flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:border dark:border-slate-700/50 dark:bg-slate-800/50">
      <button
        onClick={() => onToggle('bar')}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
          activeChart === 'bar'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-indigo-600 dark:text-white dark:shadow-indigo-500/25'
            : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white',
        )}
      >
        <BarChartIcon className="h-4 w-4" />
        Bar Chart
      </button>
      <button
        onClick={() => onToggle('line')}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
          activeChart === 'line'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-indigo-600 dark:text-white dark:shadow-indigo-500/25'
            : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white',
        )}
      >
        <ActivityLogIcon className="h-4 w-4" />
        Line Chart
      </button>
    </div>
  );
};

const extractAxisLabels = (data: any) => {
  let xAxisLabel = '';
  let yAxisLabel = '';

  // Extract X-axis label - check multiple possible locations
  if (data.xAxis) {
    if (Array.isArray(data.xAxis)) {
      xAxisLabel = data.xAxis[0]?.name || data.xAxis[0]?.axisLabel?.name || '';
    } else {
      xAxisLabel = data.xAxis?.name || data.xAxis?.axisLabel?.name || '';
    }
  }

  // Extract Y-axis label - check multiple possible locations
  if (data.yAxis) {
    if (Array.isArray(data.yAxis)) {
      yAxisLabel = data.yAxis[0]?.name || data.yAxis[0]?.axisLabel?.name || '';
    } else {
      yAxisLabel = data.yAxis?.name || data.yAxis?.axisLabel?.name || '';
    }
  }

  // Fallback: try to infer from series names or data structure
  if (!xAxisLabel && data.series && data.series[0]) {
    xAxisLabel = 'Categories'; // Generic fallback
  }

  if (!yAxisLabel && data.series && data.series[0]) {
    yAxisLabel = 'Values'; // Generic fallback
  }

  return { xAxisLabel, yAxisLabel };
};

const enhanceChartOptions = (data: any, isDark: boolean) => {
  const enhancedOptions = { ...data };

  // Calculate dynamic height
  const calculateHeight = () => {
    if (data.series && Array.isArray(data.series)) {
      const maxDataPoints = Math.max(
        ...data.series.map((s: any) => (Array.isArray(s.data) ? s.data.length : 0)),
      );
      if (maxDataPoints > 20) return 450;
      if (maxDataPoints > 10) return 400;
    }
    return 350;
  };

  // Enhanced grid configuration with better spacing
  enhancedOptions.grid = {
    ...enhancedOptions.grid,
    left: '70px',
    right: '40px',
    top: '100px',
    bottom: '50px',
    containLabel: false,
  };

  // Title configuration with better positioning
  if (enhancedOptions.title) {
    enhancedOptions.title = {
      ...enhancedOptions.title,
      left: 'center',
      top: '12px',
      textStyle: {
        ...enhancedOptions.title.textStyle,
        color: isDark ? '#ffffff' : '#333333',
        fontSize: 16,
        fontWeight: 'bold',
      },
    };
  }

  // Legend with increased spacing from title
  enhancedOptions.legend = {
    ...enhancedOptions.legend,
    top: '45px',
    left: 'center',
    orient: 'horizontal',
    itemGap: 20,
    textStyle: {
      color: isDark ? '#ffffff' : '#333333',
      fontSize: 12,
    },
  };

  // X-axis configuration
  if (enhancedOptions.xAxis) {
    const xAxisConfig = {
      name: '',
      axisLine: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
      axisTick: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
      axisLabel: {
        color: isDark ? '#ffffff' : '#333333',
        fontSize: 11,
        hideOverlap: true,
        interval: 'auto',
        margin: 6,
      },
    };

    if (Array.isArray(enhancedOptions.xAxis)) {
      enhancedOptions.xAxis.forEach((axis: any) => {
        Object.assign(axis, xAxisConfig);
      });
    } else {
      Object.assign(enhancedOptions.xAxis, xAxisConfig);
    }
  }

  // Y-axis configuration
  if (enhancedOptions.yAxis) {
    const yAxisConfig = {
      name: '',
      axisLine: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
      axisTick: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
      axisLabel: {
        color: isDark ? '#ffffff' : '#333333',
        fontSize: 11,
        hideOverlap: true,
        margin: 6,
      },
    };

    if (Array.isArray(enhancedOptions.yAxis)) {
      enhancedOptions.yAxis.forEach((axis: any) => {
        Object.assign(axis, yAxisConfig);
      });
    } else {
      Object.assign(enhancedOptions.yAxis, yAxisConfig);
    }
  }

  return { options: enhancedOptions, height: calculateHeight() };
};

const ChartWithLabels = ({
  data,
  complexity,
  identifier,
  isDark,
}: {
  data: any;
  complexity: string;
  identifier: string;
  isDark: boolean;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { xAxisLabel, yAxisLabel } = extractAxisLabels(data);
  const [labelPositions, setLabelPositions] = useState({ yCenter: '50%', xBottom: '25px' });

  // Enhanced positioning calculation
  const calculateLabelPositions = () => {
    if (!chartRef.current || !containerRef.current) return;

    const chartRect = chartRef.current.getBoundingClientRect();
    const { options } = enhanceChartOptions(data, isDark);
    const gridTop = parseInt(options.grid.top) || 100;
    const gridBottom = parseInt(options.grid.bottom) || 50;
    const chartHeight = chartRect.height;

    // Y-label centered on the actual plotting area
    const plotAreaTop = gridTop;
    const plotAreaHeight = chartHeight - gridTop - gridBottom;
    const yLabelCenter = plotAreaTop + plotAreaHeight / 2;

    // X-label positioned closer to chart bottom
    const xLabelBottom = gridBottom - 18;

    setLabelPositions({
      yCenter: `${yLabelCenter}px`,
      xBottom: `${xLabelBottom}px`,
    });
  };

  useEffect(() => {
    if (!chartRef.current) return;

    const { options, height } = enhanceChartOptions(data, isDark);

    chartInstance.current = echarts.init(chartRef.current);
    chartInstance.current.setOption(options);

    setTimeout(calculateLabelPositions, 100);

    const handleResize = () => {
      chartInstance.current?.resize();
      setTimeout(calculateLabelPositions, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data, isDark]);

  const { height } = enhanceChartOptions(data, isDark);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 dark:shadow-xl dark:shadow-slate-900/20"
    >
      <div className="overflow-x-auto">
        <div className="relative p-5" style={{ minWidth: '600px', minHeight: `${height + 90}px` }}>
          {/* Y-axis label */}
          {yAxisLabel && (
            <div
              className="absolute left-2 flex items-center justify-center"
              style={{
                top: labelPositions.yCenter,
                transform: 'translateY(-50%) rotate(-90deg)',
                transformOrigin: 'center',
                zIndex: 10,
              }}
            >
              <span className="whitespace-nowrap rounded bg-white/95 px-2 py-1 text-sm font-semibold text-gray-700 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                {yAxisLabel}
              </span>
            </div>
          )}

          {/* Chart container */}
          <div className="flex justify-center" style={{ marginLeft: '32px', marginRight: '16px' }}>
            <div
              ref={chartRef}
              className="w-full max-w-5xl"
              style={{
                height: `${height}px`,
                minHeight: '350px',
                minWidth: '500px',
              }}
            />
          </div>

          {/* X-axis label */}
          {xAxisLabel && (
            <div
              className="absolute left-1/2 flex items-center justify-center"
              style={{
                bottom: labelPositions.xBottom,
                transform: 'translateX(-50%)',
                zIndex: 10,
              }}
            >
              <span className="whitespace-nowrap rounded bg-white/95 px-2 py-1 text-sm font-semibold text-gray-700 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                {xAxisLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ChartComponent = ({
  data,
  complexity,
  identifier,
}: {
  data: any;
  complexity: string;
  identifier: string;
}) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <ChartWithLabels data={data} complexity={complexity} identifier={identifier} isDark={isDark} />
  );
};

const ChartRenderer = ({ charts }: { charts: ChartData[] }) => {
  const [activeChart, setActiveChart] = useState<'bar' | 'line'>('bar');

  const barChart = charts.find((chart) => chart.type === 'bar');
  const lineChart = charts.find((chart) => chart.type === 'line');

  if (!barChart && !lineChart) return null;

  return (
    <div className="my-6">
      <ChartToggle onToggle={setActiveChart} activeChart={activeChart} />

      {activeChart === 'bar' && barChart && (
        <ChartComponent
          data={barChart.data}
          complexity={barChart.complexity}
          identifier={barChart.identifier}
        />
      )}

      {activeChart === 'line' && lineChart && (
        <ChartComponent
          data={lineChart.data}
          complexity={lineChart.complexity}
          identifier={lineChart.identifier}
        />
      )}
    </div>
  );
};

export default ChartRenderer;
