import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { getMCPProgressAtom } from '~/store/mcp';

interface MCPProgressProps {
  conversationId: string;
  serverName: string;
  toolName: string;
}

export default function MCPProgress({ conversationId, serverName, toolName }: MCPProgressProps) {
  const progressData = useAtomValue(getMCPProgressAtom(conversationId));

  // Get the latest progress for this specific tool call
  const latestProgress = useMemo(() => {
    if (!progressData || progressData.length === 0) {
      return null;
    }

    // Filter for this specific server and tool
    const toolProgress = progressData.filter(
      (p) => p.serverName === serverName && p.toolName === toolName,
    );

    if (toolProgress.length === 0) {
      return null;
    }

    // Get the most recent progress update
    return toolProgress[toolProgress.length - 1];
  }, [progressData, serverName, toolName]);

  if (!latestProgress) {
    return null;
  }

  const { progress, total, message } = latestProgress;
  const percentage = total ? Math.round((progress / total) * 100) : Math.round(progress * 100);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {serverName} - {toolName}
        </span>
        <span className="text-gray-500 dark:text-gray-400">{percentage}%</span>
      </div>

      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {message && <div className="text-xs text-gray-600 dark:text-gray-400">{message}</div>}
    </div>
  );
}
