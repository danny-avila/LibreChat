import type { ChartData, ChartDataset } from './types';

export interface ParsedChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export class ChartDataParser {
  /**
   * Parse chart data from various sources (URL, JSON, CSV)
   */
  static async parse(data: string, chartType: string): Promise<ParsedChartData> {
    // Check if data is a URL
    if (this.isUrl(data)) {
      return await this.parseFromUrl(data, chartType);
    }

    const trimmedData = data.trim();
    
    // Try to parse as JSON first
    if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
      try {
        const jsonData = JSON.parse(data);
        return this.parseJson(jsonData, chartType);
      } catch (error) {
        throw new Error(`Invalid JSON data format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Otherwise, try CSV
    return this.parseCsv(data, chartType);
  }

  /**
   * Check if string is a valid URL
   */
  private static isUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Fetch and parse data from URL
   */
  private static async parseFromUrl(url: string, chartType: string): Promise<ParsedChartData> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (contentType.includes('application/json')) {
        const jsonData = JSON.parse(text);
        return this.parseJson(jsonData, chartType);
      } else {
        // Assume CSV format
        return this.parseCsv(text, chartType);
      }
    } catch (error) {
      throw new Error(`Failed to parse data from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse JSON data into chart format
   */
  private static parseJson(data: any, chartType: string): ParsedChartData {
    // Handle Chart.js format directly
    if (data.labels && data.datasets) {
      return {
        labels: data.labels,
        datasets: data.datasets.map((dataset: any) => ({
          label: dataset.label || 'Dataset',
          data: dataset.data || [],
          backgroundColor: dataset.backgroundColor || this.getDefaultColors(chartType)[0],
          borderColor: dataset.borderColor || this.getDefaultBorderColors(chartType)[0],
          borderWidth: dataset.borderWidth || 1,
        })),
      };
    }

    // Handle simple key-value object
    if (typeof data === 'object' && !Array.isArray(data)) {
      const labels = Object.keys(data);
      if (labels.length === 0) {
        throw new Error('Invalid JSON data format for chart');
      }
      
      const values = Object.values(data) as number[];
      
      return {
        labels,
        datasets: [{
          label: 'Data',
          data: values,
          backgroundColor: this.getDefaultColors(chartType),
          borderColor: this.getDefaultBorderColors(chartType),
          borderWidth: 1,
        }],
      };
    }

    // Handle array of objects
    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new Error('Invalid JSON data format for chart');
      }
      
      const firstItem = data[0];
      if (typeof firstItem === 'object') {
        const keys = Object.keys(firstItem);
        const labelKey = keys[0];
        const valueKeys = keys.slice(1);

        const labels = data.map(item => String(item[labelKey]));
        const datasets = valueKeys.map((key, index) => ({
          label: key,
          data: data.map(item => Number(item[key]) || 0),
          backgroundColor: this.getDefaultColors(chartType)[index % this.getDefaultColors(chartType).length],
          borderColor: this.getDefaultBorderColors(chartType)[index % this.getDefaultBorderColors(chartType).length],
          borderWidth: 1,
        }));

        return { labels, datasets };
      }
    }

    throw new Error('Invalid JSON data format for chart');
  }

  /**
   * Parse CSV data into chart format
   */
  private static parseCsv(csvText: string, chartType: string): ParsedChartData {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header and one data row');
    }

    // Parse header
    const headers = this.parseCsvLine(lines[0]);
    const labelColumn = headers[0];
    const dataColumns = headers.slice(1);

    // Parse data rows
    const rows = lines.slice(1).map(line => this.parseCsvLine(line));
    
    const labels = rows.map(row => row[0] || '');
    const datasets = dataColumns.map((column, index) => ({
      label: column,
      data: rows.map(row => {
        const value = parseFloat(row[index + 1]);
        return isNaN(value) ? 0 : value;
      }),
      backgroundColor: this.getDefaultColors(chartType)[index % this.getDefaultColors(chartType).length],
      borderColor: this.getDefaultBorderColors(chartType)[index % this.getDefaultBorderColors(chartType).length],
      borderWidth: 1,
    }));

    return { labels, datasets };
  }

  /**
   * Parse a single CSV line, handling quoted values
   */
  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Get default colors for different chart types
   */
  private static getDefaultColors(chartType: string): string[] {
    const colors = [
      'rgba(54, 162, 235, 0.6)',   // Blue
      'rgba(255, 99, 132, 0.6)',   // Red
      'rgba(255, 205, 86, 0.6)',   // Yellow
      'rgba(75, 192, 192, 0.6)',   // Green
      'rgba(153, 102, 255, 0.6)',  // Purple
      'rgba(255, 159, 64, 0.6)',   // Orange
      'rgba(199, 199, 199, 0.6)',  // Grey
      'rgba(83, 102, 255, 0.6)',   // Indigo
    ];

    if (chartType === 'pie') {
      return colors;
    }

    return colors;
  }

  /**
   * Get default border colors for different chart types
   */
  private static getDefaultBorderColors(chartType: string): string[] {
    const colors = [
      'rgba(54, 162, 235, 1)',   // Blue
      'rgba(255, 99, 132, 1)',   // Red
      'rgba(255, 205, 86, 1)',   // Yellow
      'rgba(75, 192, 192, 1)',   // Green
      'rgba(153, 102, 255, 1)',  // Purple
      'rgba(255, 159, 64, 1)',   // Orange
      'rgba(199, 199, 199, 1)',  // Grey
      'rgba(83, 102, 255, 1)',   // Indigo
    ];

    return colors;
  }

  /**
   * Validate chart data structure
   */
  static validateData(data: ParsedChartData): void {
    if (!data.labels || !Array.isArray(data.labels)) {
      throw new Error('Chart data must have labels array');
    }

    if (!data.datasets || !Array.isArray(data.datasets) || data.datasets.length === 0) {
      throw new Error('Chart data must have at least one dataset');
    }

    for (const dataset of data.datasets) {
      if (!dataset.data || !Array.isArray(dataset.data)) {
        throw new Error('Each dataset must have a data array');
      }

      if (dataset.data.length !== data.labels.length) {
        throw new Error('Dataset data length must match labels length');
      }
    }
  }
}