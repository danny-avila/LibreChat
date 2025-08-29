/**
 * ChartDataParser Tests
 * 
 * Tests for the ChartDataParser utility class including:
 * - CSV parsing with various formats
 * - JSON parsing with different structures
 * - URL data fetching (mocked)
 * - Error handling and validation
 * - Edge cases and malformed data
 */

import { ChartDataParser } from '../ChartDataParser';

// Mock fetch for URL testing
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('ChartDataParser', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('CSV Parsing', () => {
    it('should parse simple CSV data correctly', async () => {
      const csvData = `Month,Sales
January,100
February,150
March,200`;

      const result = await ChartDataParser.parse(csvData, 'bar');

      expect(result.labels).toEqual(['January', 'February', 'March']);
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].label).toBe('Sales');
      expect(result.datasets[0].data).toEqual([100, 150, 200]);
    });

    it('should parse CSV with multiple data columns', async () => {
      const csvData = `Month,Sales,Profit
January,100,20
February,150,30
March,200,40`;

      const result = await ChartDataParser.parse(csvData, 'line');

      expect(result.labels).toEqual(['January', 'February', 'March']);
      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0].label).toBe('Sales');
      expect(result.datasets[0].data).toEqual([100, 150, 200]);
      expect(result.datasets[1].label).toBe('Profit');
      expect(result.datasets[1].data).toEqual([20, 30, 40]);
    });

    it('should handle CSV with quoted values', async () => {
      const csvData = `Product,"Sales, Q1","Sales, Q2"
"Product A",100,150
"Product B",200,250`;

      const result = await ChartDataParser.parse(csvData, 'bar');

      expect(result.labels).toEqual(['Product A', 'Product B']);
      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0].label).toBe('Sales, Q1');
      expect(result.datasets[1].label).toBe('Sales, Q2');
    });

    it('should handle CSV with missing values', async () => {
      const csvData = `Month,Sales
January,100
February,
March,200`;

      const result = await ChartDataParser.parse(csvData, 'bar');

      expect(result.datasets[0].data).toEqual([100, 0, 200]);
    });

    it('should handle CSV with non-numeric values', async () => {
      const csvData = `Month,Sales
January,abc
February,150
March,xyz`;

      const result = await ChartDataParser.parse(csvData, 'bar');

      expect(result.datasets[0].data).toEqual([0, 150, 0]);
    });

    it('should throw error for CSV with insufficient data', async () => {
      const csvData = `Month`;

      await expect(ChartDataParser.parse(csvData, 'bar')).rejects.toThrow(
        'CSV must have at least a header and one data row'
      );
    });
  });

  describe('JSON Parsing', () => {
    it('should parse Chart.js format JSON', async () => {
      const jsonData = JSON.stringify({
        labels: ['A', 'B', 'C'],
        datasets: [{
          label: 'Dataset 1',
          data: [10, 20, 30],
          backgroundColor: 'red'
        }]
      });

      const result = await ChartDataParser.parse(jsonData, 'pie');

      expect(result.labels).toEqual(['A', 'B', 'C']);
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].label).toBe('Dataset 1');
      expect(result.datasets[0].data).toEqual([10, 20, 30]);
      expect(result.datasets[0].backgroundColor).toBe('red');
    });

    it('should parse simple key-value object', async () => {
      const jsonData = JSON.stringify({
        'Product A': 100,
        'Product B': 200,
        'Product C': 150
      });

      const result = await ChartDataParser.parse(jsonData, 'bar');

      expect(result.labels).toEqual(['Product A', 'Product B', 'Product C']);
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].label).toBe('Data');
      expect(result.datasets[0].data).toEqual([100, 200, 150]);
    });

    it('should parse array of objects', async () => {
      const jsonData = JSON.stringify([
        { month: 'Jan', sales: 100, profit: 20 },
        { month: 'Feb', sales: 150, profit: 30 },
        { month: 'Mar', sales: 200, profit: 40 }
      ]);

      const result = await ChartDataParser.parse(jsonData, 'line');

      expect(result.labels).toEqual(['Jan', 'Feb', 'Mar']);
      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0].label).toBe('sales');
      expect(result.datasets[0].data).toEqual([100, 150, 200]);
      expect(result.datasets[1].label).toBe('profit');
      expect(result.datasets[1].data).toEqual([20, 30, 40]);
    });

    it('should throw error for invalid JSON format', async () => {
      const invalidJson = 'invalid json';

      // Should fall back to CSV parsing and fail there
      await expect(ChartDataParser.parse(invalidJson, 'bar')).rejects.toThrow();
    });
  });

  describe('URL Data Fetching', () => {
    it('should fetch and parse JSON from URL', async () => {
      const jsonData = {
        labels: ['A', 'B', 'C'],
        datasets: [{ label: 'Test', data: [1, 2, 3] }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(jsonData))
      } as Response);

      const result = await ChartDataParser.parse('https://example.com/data.json', 'bar');

      expect(result.labels).toEqual(['A', 'B', 'C']);
      expect(result.datasets[0].data).toEqual([1, 2, 3]);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json');
    });

    it('should fetch and parse CSV from URL', async () => {
      const csvData = `Month,Sales
Jan,100
Feb,200`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(csvData)
      } as Response);

      const result = await ChartDataParser.parse('https://example.com/data.csv', 'bar');

      expect(result.labels).toEqual(['Jan', 'Feb']);
      expect(result.datasets[0].data).toEqual([100, 200]);
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      await expect(ChartDataParser.parse('https://example.com/missing.json', 'bar'))
        .rejects.toThrow('Failed to fetch data: 404 Not Found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(ChartDataParser.parse('https://example.com/data.json', 'bar'))
        .rejects.toThrow('Failed to parse data from URL: Network error');
    });
  });

  describe('Data Validation', () => {
    it('should validate correct data structure', () => {
      const validData = {
        labels: ['A', 'B', 'C'],
        datasets: [{
          label: 'Test',
          data: [1, 2, 3]
        }]
      };

      expect(() => ChartDataParser.validateData(validData)).not.toThrow();
    });

    it('should throw error for missing labels', () => {
      const invalidData = {
        datasets: [{
          label: 'Test',
          data: [1, 2, 3]
        }]
      } as any;

      expect(() => ChartDataParser.validateData(invalidData))
        .toThrow('Chart data must have labels array');
    });

    it('should throw error for missing datasets', () => {
      const invalidData = {
        labels: ['A', 'B', 'C']
      } as any;

      expect(() => ChartDataParser.validateData(invalidData))
        .toThrow('Chart data must have at least one dataset');
    });

    it('should throw error for mismatched data length', () => {
      const invalidData = {
        labels: ['A', 'B', 'C'],
        datasets: [{
          label: 'Test',
          data: [1, 2] // Missing one data point
        }]
      };

      expect(() => ChartDataParser.validateData(invalidData))
        .toThrow('Dataset data length must match labels length');
    });

    it('should throw error for dataset without data array', () => {
      const invalidData = {
        labels: ['A', 'B', 'C'],
        datasets: [{
          label: 'Test'
          // Missing data array
        }]
      } as any;

      expect(() => ChartDataParser.validateData(invalidData))
        .toThrow('Each dataset must have a data array');
    });
  });

  describe('Color Assignment', () => {
    it('should assign default colors to datasets', async () => {
      const csvData = `Month,Sales,Profit
Jan,100,20
Feb,150,30`;

      const result = await ChartDataParser.parse(csvData, 'bar');

      expect(result.datasets[0].backgroundColor).toBeDefined();
      expect(result.datasets[0].borderColor).toBeDefined();
      expect(result.datasets[1].backgroundColor).toBeDefined();
      expect(result.datasets[1].borderColor).toBeDefined();
      
      // Colors should be different for different datasets
      expect(result.datasets[0].backgroundColor).not.toBe(result.datasets[1].backgroundColor);
    });

    it('should preserve existing colors from JSON data', async () => {
      const jsonData = JSON.stringify({
        labels: ['A', 'B'],
        datasets: [{
          label: 'Test',
          data: [1, 2],
          backgroundColor: 'custom-color',
          borderColor: 'custom-border'
        }]
      });

      const result = await ChartDataParser.parse(jsonData, 'bar');

      expect(result.datasets[0].backgroundColor).toBe('custom-color');
      expect(result.datasets[0].borderColor).toBe('custom-border');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty CSV data', async () => {
      const csvData = '';

      await expect(ChartDataParser.parse(csvData, 'bar')).rejects.toThrow();
    });

    it('should handle CSV with only headers', async () => {
      const csvData = 'Month,Sales';

      await expect(ChartDataParser.parse(csvData, 'bar')).rejects.toThrow(
        'CSV must have at least a header and one data row'
      );
    });

    it('should handle empty JSON object', async () => {
      const jsonData = '{}';

      await expect(ChartDataParser.parse(jsonData, 'bar')).rejects.toThrow(
        'Invalid JSON data format for chart'
      );
    });

    it('should handle empty array', async () => {
      const jsonData = '[]';

      await expect(ChartDataParser.parse(jsonData, 'bar')).rejects.toThrow(
        'Invalid JSON data format for chart'
      );
    });

    it('should handle whitespace-only data', async () => {
      const data = '   \n\t   ';

      await expect(ChartDataParser.parse(data, 'bar')).rejects.toThrow();
    });
  });

  describe('Chart Type Specific Behavior', () => {
    it('should handle different chart types consistently', async () => {
      const csvData = `Category,Value
A,10
B,20`;

      const barResult = await ChartDataParser.parse(csvData, 'bar');
      const lineResult = await ChartDataParser.parse(csvData, 'line');
      const pieResult = await ChartDataParser.parse(csvData, 'pie');

      // Data structure should be the same regardless of chart type
      expect(barResult.labels).toEqual(lineResult.labels);
      expect(barResult.labels).toEqual(pieResult.labels);
      expect(barResult.datasets[0].data).toEqual(lineResult.datasets[0].data);
      expect(barResult.datasets[0].data).toEqual(pieResult.datasets[0].data);
    });
  });
});