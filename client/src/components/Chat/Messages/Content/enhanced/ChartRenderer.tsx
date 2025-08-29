import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import { ChartDataParser, type ParsedChartData } from './ChartDataParser';
import { globalMemoryManager } from './utils/MemoryManager';
import { globalPerformanceMonitor } from './utils/PerformanceMonitor';
import { globalCacheManager } from './utils/CacheManager';
import { sanitizeChartData } from './utils/SecurityUtils';
import { checkChartCompatibility } from './utils/BrowserCompatibility';
import { CompatibilityWarning } from './components/CompatibilityWarning';
import { ChartPlaceholder } from './components/PlaceholderComponents';
import type { ChartRendererProps } from './types';
import { 
  globalAccessibilityUtils, 
  getAriaLabels, 
  getKeyboardHandlers, 
  getLiveRegionManager,
  generateChartDescription 
} from './utils/AccessibilityUtils';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartState {
  data: ParsedChartData | null;
  loading: boolean;
  error: string | null;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ type, data: rawData }) => {
  // Check browser compatibility first
  const compatibilityCheck = checkChartCompatibility();
  
  const [state, setState] = useState<ChartState>({
    data: null,
    loading: true,
    error: null,
  });

  // Return compatibility warning if not supported
  if (!compatibilityCheck.isSupported) {
    return (
      <div className="enhanced-chart-container">
        <CompatibilityWarning
          feature="charts"
          compatibility={compatibilityCheck}
          showDetails={true}
        />
      </div>
    );
  }
  
  const chartRef = useRef<ChartJS | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartSettings = globalPerformanceMonitor.getChartSettings();
  
  // Accessibility utilities
  const ariaLabels = getAriaLabels();
  const keyboardHandlers = getKeyboardHandlers();
  const liveRegionManager = getLiveRegionManager();

  // Parse chart data with caching and performance optimization
  useEffect(() => {
    const parseData = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        // Check cache first
        const cacheKey = `chart-${type}-${JSON.stringify(rawData).substring(0, 100)}`;
        const cached = await globalCacheManager.getData(cacheKey);
        
        if (cached) {
          setState({ data: cached.data, loading: false, error: null });
          return;
        }

        // Sanitize chart data for security
        const sanitizationResult = sanitizeChartData(rawData);
        if (!sanitizationResult.isValid) {
          throw new Error(sanitizationResult.error || 'Invalid chart data');
        }

        const parsedData = await ChartDataParser.parse(sanitizationResult.sanitizedData || rawData, type);
        ChartDataParser.validateData(parsedData);
        
        // Limit data points based on performance
        if (parsedData.labels.length > chartSettings.maxDataPoints) {
          const step = Math.ceil(parsedData.labels.length / chartSettings.maxDataPoints);
          parsedData.labels = parsedData.labels.filter((_, i) => i % step === 0);
          parsedData.datasets = parsedData.datasets.map(dataset => ({
            ...dataset,
            data: dataset.data.filter((_, i) => i % step === 0),
          }));
        }
        
        // Cache the parsed data
        await globalCacheManager.setData(cacheKey, parsedData, 'chart-data');
        
        setState({ data: parsedData, loading: false, error: null });
        
        // Announce successful chart load to screen readers
        const chartDescription = generateChartDescription(type, parsedData);
        liveRegionManager.announce(`Chart loaded: ${chartDescription}`, 'polite');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to parse chart data';
        setState({ data: null, loading: false, error: errorMessage });
        
        // Announce error to screen readers
        const errorAnnouncement = ariaLabels.chartError(type, errorMessage);
        liveRegionManager.announceStatus(errorAnnouncement, 'assertive');
      }
    };

    parseData();
  }, [rawData, type, chartSettings.maxDataPoints]);

  // Detect screen size for responsive chart options
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Memory management for chart instance
  useEffect(() => {
    const chartId = `chart-${type}-${Date.now()}`;
    
    return () => {
      // Cleanup chart instance
      if (chartRef.current) {
        globalMemoryManager.track(chartId, 'chart', chartRef.current, 1024 * 1024); // Estimate 1MB
        globalMemoryManager.cleanup(chartId);
      }
    };
  }, [type]);

  // Chart configuration options with performance optimizations
  const chartOptions = useMemo((): ChartOptions<any> => {
    const baseOptions: ChartOptions<any> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: chartSettings.enableAnimations ? {
        duration: 750,
        easing: 'easeInOutQuart',
      } : false,
      interaction: chartSettings.enableInteractions ? {
        intersect: false,
        mode: 'index',
      } : false,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' as const : 'top' as const,
          labels: {
            boxWidth: isMobile ? 10 : 12,
            padding: isMobile ? 10 : 15,
            font: {
              size: isMobile ? 10 : 12,
            },
            usePointStyle: isMobile, // Use point style on mobile for better space usage
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleFont: {
            size: isMobile ? 12 : 14,
          },
          bodyFont: {
            size: isMobile ? 11 : 12,
          },
          padding: isMobile ? 8 : 12,
        },
      },
    };

    // Chart type specific options
    switch (type) {
      case 'pie':
        return {
          ...baseOptions,
          plugins: {
            ...baseOptions.plugins,
            legend: {
              ...baseOptions.plugins?.legend,
              position: isMobile ? 'bottom' as const : 'right' as const,
            },
          },
        };
      
      case 'scatter':
        return {
          ...baseOptions,
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
              },
              ticks: {
                color: 'rgba(0, 0, 0, 0.7)',
              },
            },
            y: {
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
              },
              ticks: {
                color: 'rgba(0, 0, 0, 0.7)',
              },
            },
          },
        };
      
      default:
        return {
          ...baseOptions,
          scales: {
            x: {
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
              },
              ticks: {
                color: 'rgba(0, 0, 0, 0.7)',
                maxRotation: isMobile ? 90 : 45, // Vertical labels on mobile
                font: {
                  size: isMobile ? 10 : 12,
                },
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(0, 0, 0, 0.1)',
              },
              ticks: {
                color: 'rgba(0, 0, 0, 0.7)',
                font: {
                  size: isMobile ? 10 : 12,
                },
              },
            },
          },
        };
    }
  }, [type, isMobile]);

  // Render chart component based on type
  const renderChart = () => {
    if (!state.data) return null;

    const chartData = {
      labels: state.data.labels,
      datasets: state.data.datasets,
    };

    switch (type) {
      case 'bar':
        return <Bar data={chartData} options={chartOptions} />;
      case 'line':
        return <Line data={chartData} options={chartOptions} />;
      case 'pie':
        return <Pie data={chartData} options={chartOptions} />;
      case 'scatter':
        // Transform data for scatter plot
        const scatterData = {
          datasets: state.data.datasets.map(dataset => ({
            ...dataset,
            data: dataset.data.map((y, x) => ({ x, y })),
          })),
        };
        return <Scatter data={scatterData} options={chartOptions} />;
      default:
        return <div className="text-red-500">Unsupported chart type: {type}</div>;
    }
  };

  // Loading state with performance-aware placeholder
  if (state.loading) {
    return (
      <ChartPlaceholder 
        type={type} 
        className="enhanced-chart-container"
      />
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="enhanced-chart-container">
        <div className="enhanced-chart-header">
          <h4 className="enhanced-chart-title">
            {type.charAt(0).toUpperCase() + type.slice(1)} Chart
          </h4>
        </div>
        <div className="enhanced-chart-content error">
          <div className="enhanced-chart-error">
            <div className="enhanced-chart-error-icon">⚠️</div>
            <div className="enhanced-chart-error-message">
              <strong>Chart Error:</strong> {state.error}
            </div>
            <div className="enhanced-chart-error-details">
              Please check your data format and try again.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generate chart description for accessibility
  const chartDescription = state.data ? generateChartDescription(type, state.data) : '';
  const chartAriaLabel = state.data ? ariaLabels.chart(type, state.data.labels.length, state.data.datasets.length) : '';

  // Success state
  return (
    <div 
      ref={containerRef}
      className="enhanced-chart-container"
      role="img"
      aria-label={chartAriaLabel}
      tabIndex={0}
    >
      <div className="enhanced-chart-header">
        <h4 
          className="enhanced-chart-title"
          id={`chart-title-${type}-${Date.now()}`}
        >
          {type.charAt(0).toUpperCase() + type.slice(1)} Chart
        </h4>
        <div 
          className="enhanced-chart-info"
          id={`chart-info-${type}-${Date.now()}`}
        >
          {state.data?.datasets.length} dataset{state.data?.datasets.length !== 1 ? 's' : ''}, {state.data?.labels.length} data points
        </div>
      </div>
      <div className="enhanced-chart-content">
        <div 
          className="enhanced-chart-wrapper"
          role="img"
          aria-labelledby={`chart-title-${type}-${Date.now()}`}
          aria-describedby={`chart-description-${type}-${Date.now()}`}
        >
          {renderChart()}
        </div>
        
        {/* Hidden description for screen readers */}
        <div 
          id={`chart-description-${type}-${Date.now()}`}
          className="sr-only"
        >
          {chartDescription}
          {state.data && state.data.datasets.map((dataset, index) => (
            <span key={index}>
              Dataset {index + 1}: {dataset.label || 'Unnamed'}. 
              Values: {dataset.data.join(', ')}.
            </span>
          ))}
        </div>
        
        {/* Chart data table for screen readers */}
        {state.data && (
          <table className="sr-only" aria-label="Chart data table">
            <caption>Data table for {type} chart</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {state.data.datasets.map((dataset, index) => (
                  <th key={index} scope="col">{dataset.label || `Dataset ${index + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.labels.map((label, labelIndex) => (
                <tr key={labelIndex}>
                  <th scope="row">{label}</th>
                  {state.data!.datasets.map((dataset, datasetIndex) => (
                    <td key={datasetIndex}>{dataset.data[labelIndex] || 'N/A'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};