// ContentEnhancer.tsx
import React from 'react';
import ChartRenderer from '~/components/Chat/Messages/Content/ChartRenderer';
import ChartSkeleton from '~/components/Chat/Messages/Content/ChartSkeleton';
import { useLocalize } from '~/hooks';

interface ProcessResult {
  processedText: string;
  enhancedElements: React.ReactNode;
}

const ChartErrorFallback = () => {
  const localize = useLocalize();

  return (
    <div className="my-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">{localize('com_ui_failed_to_render_chart')}</span>
      </div>
      <p className="mt-2 text-sm text-red-600 dark:text-red-400">
        {localize('com_ui_chart_data_could_not_be_processed')}
      </p>
    </div>
  );
};

// Fixed chart parsing with improved streaming detection
const parseChartBlocks = (text: string) => {
  console.log('📊 Parsing text length:', text.length);
  console.log('📊 Text contains :::', text.includes(':::'));

  const chartRegex = /:::(bar|line)chart\{([^}]+)\}\n([\s\S]*?)\n:::/g;
  const charts: any[] = [];
  let cleanedText = text;
  let hasParsingErrors = false;

  // SIMPLIFIED streaming detection - check for unmatched opening/closing tags
  const tripleColonCount = (text.match(/:::/g) || []).length;
  const hasUnmatchedTags = tripleColonCount > 0 && tripleColonCount % 2 !== 0;

  // Also check for incomplete chart block syntax
  const hasIncompleteChartBlock =
    /:::(bar|line)chart\{[^}]*$/.test(text) ||
    /:::(bar|line)chart\{[^}]*\}$/.test(text) ||
    /:::(bar|line)chart\{[^}]*\}\n[^:]*$/.test(text);

  if (hasUnmatchedTags || hasIncompleteChartBlock) {
    console.log('📊 Streaming detected - unmatched tags or incomplete block');
    return { charts: [], cleanedText: text, isStreaming: true, hasErrors: false };
  }

  // Find all complete chart blocks
  const matches = text.match(chartRegex);
  console.log('📊 Found chart blocks:', matches?.length || 0);

  if (matches) {
    matches.forEach((match, index) => {
      console.log(`📊 Processing block ${index}:`, match.substring(0, 100) + '...');
    });
  }

  let match;
  while ((match = chartRegex.exec(text)) !== null) {
    const [fullMatch, chartType, attributes, jsonData] = match;

    try {
      console.log('📊 Parsing attributes:', attributes);

      // Enhanced attribute parsing with validation
      const attrMatches = attributes.match(/(\w+)="([^"]+)"/g) || [];
      const attrs: Record<string, string> = {};

      attrMatches.forEach((attr) => {
        const [key, value] = attr.split('=');
        if (key && value) {
          attrs[key] = value.replace(/"/g, '');
        }
      });

      console.log('📊 Parsed attributes:', attrs);

      // Validate required attributes
      if (!attrs.identifier || !attrs.title) {
        console.error('📊 Missing required chart attributes:', attrs);
        hasParsingErrors = true;
        continue;
      }

      // Parse and validate JSON data
      const trimmedJsonData = jsonData.trim();
      console.log('📊 JSON data preview:', trimmedJsonData.substring(0, 200));

      if (!trimmedJsonData.startsWith('{') || !trimmedJsonData.endsWith('}')) {
        console.error('📊 Invalid JSON structure in chart block');
        hasParsingErrors = true;
        continue;
      }

      const parsedData = JSON.parse(trimmedJsonData);
      console.log('📊 Successfully parsed JSON data');

      // Validate essential chart properties
      if (
        !parsedData.series ||
        !Array.isArray(parsedData.series) ||
        parsedData.series.length === 0
      ) {
        console.error('📊 Invalid or missing series data');
        hasParsingErrors = true;
        continue;
      }

      charts.push({
        type: chartType as 'bar' | 'line',
        identifier: attrs.identifier,
        complexity: (attrs.complexity as 'simple' | 'moderate' | 'complex') || 'simple',
        title: attrs.title,
        xLabel: attrs.xLabel || 'Categories',
        yLabel: attrs.yLabel || 'Values',
        data: parsedData,
      });

      cleanedText = cleanedText.replace(fullMatch, '');
      console.log('📊 Successfully added chart:', chartType, attrs.identifier);
    } catch (error) {
      console.error('📊 Error parsing chart block:', error);
      hasParsingErrors = true;
      // Remove the malformed block from text
      cleanedText = cleanedText.replace(fullMatch, '');
    }
  }

  console.log(
    '📊 Final result - Charts:',
    charts.length,
    'Streaming:',
    false,
    'Errors:',
    hasParsingErrors,
  );

  return {
    charts,
    cleanedText: cleanedText.trim(),
    isStreaming: false,
    hasErrors: hasParsingErrors,
  };
};

export class ContentEnhancer {
  // Main processing method - can be extended for other content types
  static process(text: string, isCreatedByUser: boolean): ProcessResult {
    // Only process charts for non-user messages
    if (isCreatedByUser) {
      return {
        processedText: text,
        enhancedElements: null,
      };
    }

    // Process charts
    const chartResult = this.processCharts(text);

    // Future: Add other processors here
    // const tableResult = this.processTables(chartResult.processedText);
    // const codeResult = this.processCodeBlocks(tableResult.processedText);

    return chartResult;
  }

  // Chart-specific processing
  private static processCharts(text: string): ProcessResult {
    const { charts, cleanedText, isStreaming, hasErrors } = parseChartBlocks(text);

    const enhancedElements = (
      <>
        {/* Show streaming skeleton loader */}
        {isStreaming && !hasErrors && <ChartSkeleton />}

        {/* Show error fallback if parsing failed */}
        {hasErrors && !isStreaming && <ChartErrorFallback />}

        {/* Show charts if successfully parsed */}
        {!isStreaming && !hasErrors && charts.length > 0 && <ChartRenderer charts={charts} />}
      </>
    );

    return {
      processedText: cleanedText,
      enhancedElements,
    };
  }

  // Future: Add more processors
  // private static processTables(text: string): ProcessResult { ... }
  // private static processCodeBlocks(text: string): ProcessResult { ... }
}
