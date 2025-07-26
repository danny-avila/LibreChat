import { useState, useEffect, useRef } from 'react';
import { BarChartIcon, ActivityLogIcon } from '@radix-ui/react-icons';
import * as echarts from 'echarts';
import { cn } from '~/utils';

interface ChartData {
  type: 'bar' | 'line';
  identifier: string;
  complexity: 'simple' | 'moderate' | 'complex';
  title: string;
  xLabel: string;
  yLabel: string;
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
        aria-label="Switch to bar chart view"
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
        aria-label="Switch to line chart view"
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

// Custom Interactive Legend Component
const CustomLegend = ({
  series,
  colors,
  chartInstance,
  isDark,
}: {
  series: any[];
  colors: string[];
  chartInstance: React.RefObject<echarts.ECharts | null>;
  isDark: boolean;
}) => {
  const [hiddenSeries, setHiddenSeries] = useState(new Set<string>());

  const handleLegendClick = (seriesName: string) => {
    const newHidden = new Set(hiddenSeries);
    const isCurrentlyHidden = newHidden.has(seriesName);

    if (isCurrentlyHidden) {
      newHidden.delete(seriesName);
    } else {
      newHidden.add(seriesName);
    }

    setHiddenSeries(newHidden);

    // Update ECharts to show/hide series
    if (chartInstance.current) {
      chartInstance.current.dispatchAction({
        type: 'legendToggleSelect',
        name: seriesName,
      });
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 py-1">
      {series.map((s, index) => (
        <button
          key={s.name}
          onClick={() => handleLegendClick(s.name)}
          className={`flex items-center gap-2 transition-all duration-200 hover:opacity-80 ${
            hiddenSeries.has(s.name) ? 'opacity-50' : 'opacity-100'
          }`}
        >
          <div
            className="h-3 w-3 rounded transition-all duration-200"
            style={{
              backgroundColor: hiddenSeries.has(s.name) ? '#ccc' : colors[index],
            }}
          />
          <span
            className={`text-xs font-medium transition-all duration-200 ${
              isDark ? 'text-slate-300' : 'text-gray-700'
            } ${hiddenSeries.has(s.name) ? 'line-through' : ''}`}
          >
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
};

// Enhanced chart options with optimized padding
const enhanceChartOptions = (data: any, isDark: boolean) => {
  try {
    const enhancedOptions = JSON.parse(JSON.stringify(data));

    // OPTIMIZED padding - tighter spacing
    enhancedOptions.grid = {
      left: '5%',
      right: '5%',
      top: '5px',
      bottom: '35px',
      containLabel: true,
    };

    // Remove title - handled by our layout
    delete enhancedOptions.title;

    // DISABLE ECharts legend - we use custom legend
    enhancedOptions.legend = {
      show: false,
    };

    // X-axis with word wrap AND rotation
    if (enhancedOptions.xAxis) {
      const xAxisConfig = {
        axisLine: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
        axisTick: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
        axisLabel: {
          color: isDark ? '#ffffff' : '#333333',
          fontSize: 10,
          interval: 0,
          rotate: 35,
          margin: 6,
          width: 70,
          overflow: 'break',
          lineHeight: 12,
          formatter: function (value: string) {
            if (value.length > 12) {
              const words = value.split(' ');
              if (words.length > 1) {
                const mid = Math.ceil(words.length / 2);
                return words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
              } else {
                const breakPoint = Math.ceil(value.length / 2);
                return value.substring(0, breakPoint) + '\n' + value.substring(breakPoint);
              }
            }
            return value;
          },
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
        axisLine: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
        axisTick: { lineStyle: { color: isDark ? '#ffffff' : '#333333' } },
        axisLabel: {
          color: isDark ? '#ffffff' : '#333333',
          fontSize: 10,
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

    return enhancedOptions;
  } catch (error) {
    console.error('Error enhancing chart options:', error);
    throw error;
  }
};

const ChartWithCustomLegend = ({
  data,
  complexity,
  identifier,
  xLabel,
  yLabel,
  title,
  isDark,
}: {
  data: any;
  complexity: string;
  identifier: string;
  xLabel: string;
  yLabel: string;
  title: string;
  isDark: boolean;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [hasError, setHasError] = useState(false);

  const hasMultipleSeries = data.series && data.series.length > 1;

  const titleHeight = 40;
  const legendHeight = hasMultipleSeries ? 30 : 0;
  const yLabelWidth = 45;
  const xLabelHeight = 30;
  const chartHeight = 350;

  const totalHeight = titleHeight + legendHeight + chartHeight + xLabelHeight;

  useEffect(() => {
    if (!chartRef.current || hasError) return;

    let mounted = true;

    try {
      const options = enhanceChartOptions(data, isDark);

      if (chartInstance.current) {
        chartInstance.current.dispose();
      }

      chartInstance.current = echarts.init(chartRef.current);

      if (!chartInstance.current) {
        throw new Error('Failed to initialize ECharts instance');
      }

      chartInstance.current.setOption(options);

      const handleResize = () => {
        try {
          if (mounted && chartInstance.current) {
            chartInstance.current.resize();
          }
        } catch (error) {
          console.error('Error during chart resize:', error);
          if (mounted) {
            setHasError(true);
          }
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        mounted = false;
        window.removeEventListener('resize', handleResize);
        try {
          if (chartInstance.current) {
            chartInstance.current.dispose();
            chartInstance.current = null;
          }
        } catch (error) {
          console.error('Error disposing chart instance:', error);
        }
      };
    } catch (error) {
      console.error('Error initializing chart:', error);
      if (mounted) {
        setHasError(true);
      }
    }
  }, [data, isDark, hasError, identifier]);

  if (hasError) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-900/20">
        <div className="text-center">
          <p className="font-medium text-red-600 dark:text-red-400">Chart rendering failed</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            Unable to display this chart
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900"
      style={{ width: '700px', height: `${totalHeight}px` }}
    >
      {/* Container 1: Title - Reduced padding */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-center py-2"
        style={{ height: `${titleHeight}px` }}
      >
        <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>

      {/* Container 2: Custom Legend - Reduced padding */}
      {hasMultipleSeries && (
        <div
          className="absolute left-0 right-0"
          style={{
            top: `${titleHeight}px`,
            height: `${legendHeight}px`,
          }}
        >
          <CustomLegend
            series={data.series}
            colors={data.color}
            chartInstance={chartInstance}
            isDark={isDark}
          />
        </div>
      )}

      {/* Container 3: Y-Axis Label*/}
      <div
        className="absolute left-0 flex items-center justify-center pl-6"
        style={{
          top: `${titleHeight + legendHeight}px`,
          width: `${yLabelWidth}px`,
          height: `${chartHeight}px`,
        }}
      >
        <div
          className="-rotate-90 transform whitespace-nowrap"
          style={{ transformOrigin: 'center' }}
        >
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{yLabel}</span>
        </div>
      </div>

      {/* Container 4: Chart Area*/}
      <div
        className="absolute"
        style={{
          top: `${titleHeight + legendHeight}px`,
          left: `${yLabelWidth}px`,
          right: '0px',
          height: `${chartHeight}px`,
        }}
      >
        <div
          ref={chartRef}
          className="h-full w-full"
          aria-label={`Chart showing ${xLabel} vs ${yLabel}`}
        />
      </div>

      {/* Container 5: X-Axis Label*/}
      <div
        className="absolute left-0 right-0 flex items-center justify-center py-1"
        style={{
          top: `${titleHeight + legendHeight + chartHeight - 30}px`,
          height: `${xLabelHeight}px`,
        }}
      >
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{xLabel}</span>
      </div>
    </div>
  );
};

const ChartComponent = ({
  data,
  complexity,
  identifier,
  xLabel,
  yLabel,
  title,
}: {
  data: any;
  complexity: string;
  identifier: string;
  xLabel: string;
  yLabel: string;
  title: string;
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
    <div className="flex justify-center">
      <ChartWithCustomLegend
        data={data}
        complexity={complexity}
        identifier={identifier}
        xLabel={xLabel}
        yLabel={yLabel}
        title={title}
        isDark={isDark}
      />
    </div>
  );
};

const ChartRenderer = ({ charts }: { charts: ChartData[] }) => {
  const [activeChart, setActiveChart] = useState<'bar' | 'line'>('bar');

  const barChart = charts.find((chart) => chart.type === 'bar');
  const lineChart = charts.find((chart) => chart.type === 'line');

  if (!barChart && !lineChart) {
    return null;
  }

  const handleToggle = (type: 'bar' | 'line') => {
    setActiveChart(type);
  };

  return (
    <div className="my-6" role="region" aria-label="Interactive chart display">
      <ChartToggle onToggle={handleToggle} activeChart={activeChart} />

      {activeChart === 'bar' && barChart && (
        <ChartComponent
          data={barChart.data}
          complexity={barChart.complexity}
          identifier={barChart.identifier}
          xLabel={barChart.xLabel}
          yLabel={barChart.yLabel}
          title={barChart.title}
        />
      )}

      {activeChart === 'line' && lineChart && (
        <ChartComponent
          data={lineChart.data}
          complexity={lineChart.complexity}
          identifier={lineChart.identifier}
          xLabel={lineChart.xLabel}
          yLabel={lineChart.yLabel}
          title={lineChart.title}
        />
      )}
    </div>
  );
};

export default ChartRenderer;
