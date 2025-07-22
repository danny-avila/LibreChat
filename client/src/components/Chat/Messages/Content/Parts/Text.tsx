import { memo, useMemo, ReactElement, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { BarChartIcon, ActivityLogIcon } from '@radix-ui/react-icons';
import * as echarts from 'echarts';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useChatContext, useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

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
    <div className="mb-4 flex w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      <button
        onClick={() => onToggle('bar')}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
          activeChart === 'bar'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
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
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
        )}
      >
        <ActivityLogIcon className="h-4 w-4" />
        Line Chart
      </button>
    </div>
  );
};

const BarChartComponent = ({
  data,
  complexity,
  identifier,
}: {
  data: any;
  complexity: string;
  identifier: string;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize ECharts instance
    chartInstance.current = echarts.init(chartRef.current);

    // Apply the complete ECharts options
    chartInstance.current.setOption(data);

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data]);

  return (
    <div className="h-96 w-full rounded-lg border bg-white p-4 dark:bg-gray-900">
      <div className="mb-2 text-sm text-gray-500"> Bar Chart ({complexity})</div>
      <div ref={chartRef} className="h-full w-full" style={{ minHeight: '300px' }} />
    </div>
  );
};

const LineChartComponent = ({
  data,
  complexity,
  identifier,
}: {
  data: any;
  complexity: string;
  identifier: string;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize ECharts instance
    chartInstance.current = echarts.init(chartRef.current);

    // Apply the complete ECharts options
    chartInstance.current.setOption(data);

    // Handle window resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data]);

  return (
    <div className="h-96 w-full rounded-lg border bg-white p-4 dark:bg-gray-900">
      <div className="mb-2 text-sm text-gray-500">Line Chart ({complexity})</div>
      <div ref={chartRef} className="h-full w-full" style={{ minHeight: '300px' }} />
    </div>
  );
};

const parseChartBlocks = (
  text: string,
): {
  charts: ChartData[];
  cleanedText: string;
} => {
  const chartRegex = /:::(bar|line)chart\{([^}]+)\}\n([\s\S]*?)\n:::/g;
  const charts: ChartData[] = [];
  let cleanedText = text;
  let match;

  while ((match = chartRegex.exec(text)) !== null) {
    const [fullMatch, chartType, attributes, jsonData] = match;

    try {
      // Parse attributes
      const attrMatches = attributes.match(/(\w+)="([^"]+)"/g) || [];
      const attrs: Record<string, string> = {};

      attrMatches.forEach((attr) => {
        const [key, value] = attr.split('=');
        attrs[key] = value.replace(/"/g, '');
      });

      // Parse JSON data
      const parsedData = JSON.parse(jsonData.trim());

      charts.push({
        type: chartType as 'bar' | 'line',
        identifier: attrs.identifier || `chart-${Date.now()}`,
        complexity: (attrs.complexity as 'simple' | 'moderate' | 'complex') || 'simple',
        title: attrs.title || 'Chart',
        data: parsedData,
      });

      // Remove chart block from text
      cleanedText = cleanedText.replace(fullMatch, '');
    } catch (error) {
      console.error('Error parsing chart block:', error);
    }
  }

  return { charts, cleanedText: cleanedText.trim() };
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
        <BarChartComponent
          data={barChart.data}
          complexity={barChart.complexity}
          identifier={barChart.identifier}
        />
      )}

      {activeChart === 'line' && lineChart && (
        <LineChartComponent
          data={lineChart.data}
          complexity={lineChart.complexity}
          identifier={lineChart.identifier}
        />
      )}
    </div>
  );
};

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { messageId } = useMessageContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  const { charts, cleanedText } = useMemo(() => {
    if (!isCreatedByUser) {
      return parseChartBlocks(text);
    }
    return { charts: [], cleanedText: text };
  }, [text, isCreatedByUser]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={cleanedText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={cleanedText} />;
    } else {
      return <>{cleanedText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, cleanedText, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
      {charts.length > 0 && <ChartRenderer charts={charts} />}
    </div>
  );
});

export default TextPart;
