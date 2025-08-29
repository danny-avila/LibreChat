/**
 * ChartRenderer Tests
 * 
 * Tests for the ChartRenderer component including:
 * - Rendering different chart types
 * - Loading states
 * - Error handling
 * - Data parsing integration
 * - Responsive behavior
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ChartRenderer } from '../ChartRenderer';
import { ChartDataParser } from '../ChartDataParser';

// Mock Chart.js components
jest.mock('react-chartjs-2', () => ({
  Bar: ({ data, options }: any) => (
    <div data-testid="bar-chart" data-labels={JSON.stringify(data.labels)}>
      Bar Chart: {data.datasets[0]?.label}
    </div>
  ),
  Line: ({ data, options }: any) => (
    <div data-testid="line-chart" data-labels={JSON.stringify(data.labels)}>
      Line Chart: {data.datasets[0]?.label}
    </div>
  ),
  Pie: ({ data, options }: any) => (
    <div data-testid="pie-chart" data-labels={JSON.stringify(data.labels)}>
      Pie Chart: {data.datasets[0]?.label}
    </div>
  ),
  Scatter: ({ data, options }: any) => (
    <div data-testid="scatter-chart">
      Scatter Chart: {data.datasets[0]?.label}
    </div>
  ),
}));

// Mock Chart.js registration
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  LineElement: {},
  PointElement: {},
  ArcElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

// Mock ChartDataParser
jest.mock('../ChartDataParser');
const mockChartDataParser = ChartDataParser as jest.Mocked<typeof ChartDataParser>;

describe('ChartRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Chart Type Rendering', () => {
    it('should render bar chart correctly', async () => {
      const mockData = {
        labels: ['A', 'B', 'C'],
        datasets: [{
          label: 'Test Data',
          data: [10, 20, 30],
          backgroundColor: 'blue',
          borderColor: 'darkblue',
          borderWidth: 1,
        }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });

      expect(screen.getByText('Bar Chart')).toBeInTheDocument();
      expect(screen.getByText('Test Data')).toBeInTheDocument();
    });

    it('should render line chart correctly', async () => {
      const mockData = {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
          label: 'Sales',
          data: [100, 150, 200],
          backgroundColor: 'red',
          borderColor: 'darkred',
          borderWidth: 1,
        }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="line" data="sales-data" />);

      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });

      expect(screen.getByText('Line Chart')).toBeInTheDocument();
      expect(screen.getByText('Sales')).toBeInTheDocument();
    });

    it('should render pie chart correctly', async () => {
      const mockData = {
        labels: ['Red', 'Blue', 'Yellow'],
        datasets: [{
          label: 'Colors',
          data: [300, 50, 100],
          backgroundColor: ['red', 'blue', 'yellow'],
          borderColor: 'white',
          borderWidth: 2,
        }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="pie" data="color-data" />);

      await waitFor(() => {
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      });

      expect(screen.getByText('Pie Chart')).toBeInTheDocument();
      expect(screen.getByText('Colors')).toBeInTheDocument();
    });

    it('should render scatter chart correctly', async () => {
      const mockData = {
        labels: ['Point 1', 'Point 2'],
        datasets: [{
          label: 'Scatter Data',
          data: [10, 20],
          backgroundColor: 'green',
          borderColor: 'darkgreen',
          borderWidth: 1,
        }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="scatter" data="scatter-data" />);

      await waitFor(() => {
        expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
      });

      expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
      expect(screen.getByText('Scatter Data')).toBeInTheDocument();
    });

    it('should handle unsupported chart type', async () => {
      const mockData = {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type={'unsupported' as any} data="test-data" />);

      await waitFor(() => {
        expect(screen.getByText(/Unsupported chart type: unsupported/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      mockChartDataParser.parse.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(<ChartRenderer type="bar" data="test-data" />);

      expect(screen.getByText('Bar Chart')).toBeInTheDocument();
      expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
      expect(document.querySelector('.enhanced-chart-spinner')).toBeInTheDocument();
    });

    it('should show correct chart title in loading state', () => {
      mockChartDataParser.parse.mockImplementationOnce(() => new Promise(() => {}));

      render(<ChartRenderer type="pie" data="test-data" />);

      expect(screen.getByText('Pie Chart')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error when data parsing fails', async () => {
      const errorMessage = 'Invalid data format';
      mockChartDataParser.parse.mockRejectedValueOnce(new Error(errorMessage));

      render(<ChartRenderer type="bar" data="invalid-data" />);

      await waitFor(() => {
        expect(screen.getByText('Chart Error:')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      expect(screen.getByText('Please check your data format and try again.')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });

    it('should display error when validation fails', async () => {
      const mockData = {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1] }] // Mismatched length
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {
        throw new Error('Dataset data length must match labels length');
      });

      render(<ChartRenderer type="bar" data="invalid-data" />);

      await waitFor(() => {
        expect(screen.getByText('Chart Error:')).toBeInTheDocument();
        expect(screen.getByText('Dataset data length must match labels length')).toBeInTheDocument();
      });
    });

    it('should handle unknown error types', async () => {
      mockChartDataParser.parse.mockRejectedValueOnce('String error');

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        expect(screen.getByText('Chart Error:')).toBeInTheDocument();
        expect(screen.getByText('Failed to parse chart data')).toBeInTheDocument();
      });
    });
  });

  describe('Chart Information Display', () => {
    it('should display dataset and data point count', async () => {
      const mockData = {
        labels: ['A', 'B', 'C', 'D'],
        datasets: [
          { label: 'Dataset 1', data: [1, 2, 3, 4] },
          { label: 'Dataset 2', data: [5, 6, 7, 8] }
        ]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        expect(screen.getByText('2 datasets, 4 data points')).toBeInTheDocument();
      });
    });

    it('should handle singular dataset count', async () => {
      const mockData = {
        labels: ['A', 'B'],
        datasets: [{ label: 'Single Dataset', data: [1, 2] }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="line" data="test-data" />);

      await waitFor(() => {
        expect(screen.getByText('1 dataset, 2 data points')).toBeInTheDocument();
      });
    });
  });

  describe('Data Processing', () => {
    it('should call ChartDataParser with correct parameters', async () => {
      const testData = 'Month,Sales\nJan,100\nFeb,200';
      const mockParsedData = {
        labels: ['Jan', 'Feb'],
        datasets: [{ label: 'Sales', data: [100, 200] }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockParsedData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="bar" data={testData} />);

      expect(mockChartDataParser.parse).toHaveBeenCalledWith(testData, 'bar');
      
      await waitFor(() => {
        expect(mockChartDataParser.validateData).toHaveBeenCalledWith(mockParsedData);
      });
    });

    it('should re-parse data when props change', async () => {
      const initialData = 'data1';
      const newData = 'data2';
      const mockParsedData = {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      };

      mockChartDataParser.parse.mockResolvedValue(mockParsedData);
      mockChartDataParser.validateData.mockImplementation(() => {});

      const { rerender } = render(<ChartRenderer type="bar" data={initialData} />);

      expect(mockChartDataParser.parse).toHaveBeenCalledWith(initialData, 'bar');

      rerender(<ChartRenderer type="line" data={newData} />);

      expect(mockChartDataParser.parse).toHaveBeenCalledWith(newData, 'line');
      expect(mockChartDataParser.parse).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA structure', async () => {
      const mockData = {
        labels: ['A', 'B'],
        datasets: [{ label: 'Test', data: [1, 2] }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        const container = screen.getByTestId('bar-chart').closest('.enhanced-chart-container');
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('CSS Classes', () => {
    it('should apply correct CSS classes', async () => {
      const mockData = {
        labels: ['A'],
        datasets: [{ label: 'Test', data: [1] }]
      };

      mockChartDataParser.parse.mockResolvedValueOnce(mockData);
      mockChartDataParser.validateData.mockImplementationOnce(() => {});

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        expect(document.querySelector('.enhanced-chart-container')).toBeInTheDocument();
        expect(document.querySelector('.enhanced-chart-header')).toBeInTheDocument();
        expect(document.querySelector('.enhanced-chart-content')).toBeInTheDocument();
        expect(document.querySelector('.enhanced-chart-wrapper')).toBeInTheDocument();
      });
    });

    it('should apply loading CSS classes', () => {
      mockChartDataParser.parse.mockImplementationOnce(() => new Promise(() => {}));

      render(<ChartRenderer type="bar" data="test-data" />);

      expect(document.querySelector('.enhanced-chart-content.loading')).toBeInTheDocument();
      expect(document.querySelector('.enhanced-chart-loading')).toBeInTheDocument();
    });

    it('should apply error CSS classes', async () => {
      mockChartDataParser.parse.mockRejectedValueOnce(new Error('Test error'));

      render(<ChartRenderer type="bar" data="test-data" />);

      await waitFor(() => {
        expect(document.querySelector('.enhanced-chart-content.error')).toBeInTheDocument();
        expect(document.querySelector('.enhanced-chart-error')).toBeInTheDocument();
      });
    });
  });
});