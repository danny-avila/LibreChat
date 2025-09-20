import React, { useState } from 'react';
import { Network, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface A2ATaskResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface A2AChatMessageProps {
  agentName: string;
  agentId: string;
  message: string;
  timestamp: Date;
  taskId?: string;
  taskResult?: A2ATaskResult;
  isStreaming?: boolean;
  onTaskStatusUpdate?: (taskId: string, status: A2ATaskResult) => void;
}

export const A2AChatMessage: React.FC<A2AChatMessageProps> = ({
  agentName,
  agentId,
  message,
  timestamp,
  taskId,
  taskResult,
  isStreaming,
  onTaskStatusUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'running':
        return <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Task pending';
      case 'running':
        return 'Task running';
      case 'completed':
        return 'Task completed';
      case 'failed':
        return 'Task failed';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div className="group relative mb-4 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-blue-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">{agentName}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">({agentId})</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {isStreaming && (
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span>Streaming</span>
            </div>
          )}
          <span>{timestamp.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Message Content */}
      <div className="mb-3">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{message}</p>
        </div>
      </div>

      {/* Task Status */}
      {taskResult && (
        <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(taskResult.status)}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getStatusText(taskResult.status)}
              </span>
              {taskResult.status === 'running' && taskResult.startedAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Started {new Date(taskResult.startedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            {taskResult.result && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                {isExpanded ? 'Hide Result' : 'Show Result'}
              </button>
            )}
          </div>

          {/* Task Result Details */}
          {isExpanded && taskResult.result && (
            <div className="mt-3 rounded bg-gray-50 p-3 dark:bg-gray-900">
              <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">Task Result:</h4>
              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                {JSON.stringify(taskResult.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error Details */}
          {taskResult.status === 'failed' && taskResult.error && (
            <div className="mt-3 rounded bg-red-50 p-3 dark:bg-red-900/20">
              <h4 className="mb-2 text-sm font-medium text-red-900 dark:text-red-100">Error:</h4>
              <p className="text-sm text-red-700 dark:text-red-300">{taskResult.error}</p>
            </div>
          )}

          {/* Completion Time */}
          {taskResult.status === 'completed' && taskResult.completedAt && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Completed at {new Date(taskResult.completedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default A2AChatMessage;