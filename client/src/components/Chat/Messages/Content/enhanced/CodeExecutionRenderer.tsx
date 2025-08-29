import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { TerminalSquareIcon, PlayIcon, StopCircleIcon, ClockIcon } from 'lucide-react';
import { Tools, AuthType } from 'librechat-data-provider';
import { Spinner, useToastContext } from '@librechat/client';
import { useVerifyAgentToolAuth, useToolCallMutation } from '~/data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useLocalize, useCodeApiKeyForm } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { cn, normalizeLanguage } from '~/utils';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { globalMemoryManager } from './utils/MemoryManager';
import { globalPerformanceMonitor } from './utils/PerformanceMonitor';
import { XSSPrevention } from './utils/SecurityUtils';
import { CodePlaceholder } from './components/PlaceholderComponents';
import { 
  globalAccessibilityUtils, 
  getAriaLabels, 
  getKeyboardHandlers, 
  getLiveRegionManager 
} from './utils/AccessibilityUtils';

interface CodeExecutionRendererProps {
  code: string;
  language: string;
}

interface ExecutionResult {
  output?: string;
  error?: string;
  type: 'success' | 'error';
  executionTime?: number;
}

const CodeExecutionRenderer: React.FC<CodeExecutionRendererProps> = ({ code, language }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const executeButtonRef = useRef<HTMLButtonElement>(null);
  
  // Performance monitoring
  const performanceScore = globalPerformanceMonitor.getPerformanceScore();
  const isLowEndDevice = globalPerformanceMonitor.isLowEndDevice();
  
  const { messageId, conversationId, partIndex } = useMessageContext();
  const normalizedLang = useMemo(() => normalizeLanguage(language), [language]);
  
  // Accessibility utilities
  const ariaLabels = getAriaLabels();
  const keyboardHandlers = getKeyboardHandlers();
  const liveRegionManager = getLiveRegionManager();
  
  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.execute_code },
    { retry: 1 }
  );
  
  const authType = useMemo(() => data?.message ?? false, [data?.message]);
  const isAuthenticated = useMemo(() => data?.authenticated ?? false, [data?.authenticated]);
  
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } =
    useCodeApiKeyForm({});

  // Memory management for code execution
  useEffect(() => {
    const executionId = `code-execution-${language}-${Date.now()}`;
    
    return () => {
      // Cleanup execution resources
      globalMemoryManager.cleanup(executionId);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [language]);

  const execute = useToolCallMutation(Tools.execute_code, {
    onSuccess: (response) => {
      const endTime = Date.now();
      const executionTime = executionStartTime ? endTime - executionStartTime : 0;
      
      setExecutionResult({
        output: response.result as string,
        type: 'success',
        executionTime,
      });
      setIsExecuting(false);
      setExecutionStartTime(null);
      
      // Announce successful execution to screen readers
      const successMessage = ariaLabels.codeOutput('success', executionTime);
      liveRegionManager.announceStatus(successMessage, 'polite');
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    onError: (error) => {
      const endTime = Date.now();
      const executionTime = executionStartTime ? endTime - executionStartTime : 0;
      
      setExecutionResult({
        error: error.message || localize('com_ui_run_code_error'),
        type: 'error',
        executionTime,
      });
      setIsExecuting(false);
      setExecutionStartTime(null);
      
      // Announce error to screen readers
      const errorMessage = ariaLabels.codeOutput('error', executionTime);
      liveRegionManager.announceStatus(errorMessage, 'assertive');
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      showToast({ 
        message: localize('com_ui_run_code_error'), 
        status: 'error' 
      });
    },
  });

  const handleExecute = useCallback(async () => {
    if (!isAuthenticated) {
      setIsDialogOpen(true);
      return;
    }

    if (!code || !normalizedLang) {
      const invalidMessage = localize('com_ui_code_execution_invalid');
      showToast({ 
        message: invalidMessage, 
        status: 'error' 
      });
      liveRegionManager.announceStatus(invalidMessage, 'assertive');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);
    setExecutionStartTime(Date.now());
    
    // Announce execution start
    liveRegionManager.announceStatus(`Executing ${language} code`, 'polite');

    // Set timeout for 10 seconds
    timeoutRef.current = setTimeout(() => {
      const timeoutMessage = localize('com_ui_code_execution_timeout');
      setExecutionResult({
        error: timeoutMessage,
        type: 'error',
        executionTime: 10000,
      });
      setIsExecuting(false);
      setExecutionStartTime(null);
      
      showToast({ 
        message: timeoutMessage, 
        status: 'error' 
      });
      liveRegionManager.announceStatus(timeoutMessage, 'assertive');
    }, 10000);

    execute.mutate({
      partIndex: partIndex || 0,
      messageId: messageId || '',
      blockIndex: 0, // Default block index for enhanced content
      conversationId: conversationId || '',
      lang: normalizedLang,
      code: code,
    });
  }, [
    isAuthenticated,
    code,
    normalizedLang,
    setIsDialogOpen,
    showToast,
    localize,
    execute,
    partIndex,
    messageId,
    conversationId,
    language,
    liveRegionManager,
  ]);

  const handleStop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    const stopMessage = localize('com_ui_code_execution_stopped');
    setIsExecuting(false);
    setExecutionStartTime(null);
    setExecutionResult({
      error: stopMessage,
      type: 'error',
      executionTime: executionStartTime ? Date.now() - executionStartTime : 0,
    });
    
    // Announce stop to screen readers
    liveRegionManager.announceStatus(stopMessage, 'polite');
  }, [executionStartTime, localize, liveRegionManager]);

  // Handle keyboard navigation
  const handleExecuteKeyDown = keyboardHandlers.onEnterOrSpace(handleExecute);
  const handleStopKeyDown = keyboardHandlers.onEnterOrSpace(handleStop);

  // Detect mobile and cleanup timeout on unmount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const formatExecutionTime = (time: number) => {
    if (time < 1000) {
      return `${time}ms`;
    }
    return `${(time / 1000).toFixed(2)}s`;
  };

  return (
    <div 
      ref={containerRef}
      className="enhanced-code-execution my-4 rounded-lg border border-border-light bg-surface-primary"
      role="region"
      aria-label={ariaLabels.codeBlock(language)}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary px-4 py-2">
        <div className="flex items-center gap-2">
          <TerminalSquareIcon 
            size={16} 
            className="text-text-secondary"
            aria-hidden="true"
          />
          <span 
            className="text-sm font-medium text-text-primary"
            id={`code-title-${language}-${Date.now()}`}
          >
            {localize('com_ui_code_execution')} ({language})
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {executionResult?.executionTime && (
            <div 
              className="flex items-center gap-1 text-xs text-text-secondary"
              aria-label={`Execution time: ${formatExecutionTime(executionResult.executionTime)}`}
            >
              <ClockIcon size={12} aria-hidden="true" />
              {formatExecutionTime(executionResult.executionTime)}
            </div>
          )}
          
          {isExecuting ? (
            <button
              ref={executeButtonRef}
              type="button"
              onClick={handleStop}
              onKeyDown={handleStopKeyDown}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-surface-hover",
                "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
                isMobile && "min-h-[2.75rem] px-4 py-2 text-sm"
              )}
              disabled={!isExecuting}
              style={{ touchAction: 'manipulation' }}
              aria-label={`Stop executing ${language} code`}
            >
              <StopCircleIcon size={isMobile ? 16 : 14} aria-hidden="true" />
              {localize('com_ui_stop')}
            </button>
          ) : (
            <button
              ref={executeButtonRef}
              type="button"
              onClick={handleExecute}
              onKeyDown={handleExecuteKeyDown}
              className={cn(
                "flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1",
                isMobile && "min-h-[2.75rem] px-4 py-2 text-sm"
              )}
              disabled={isExecuting || !code}
              style={{ touchAction: 'manipulation' }}
              aria-label={ariaLabels.executeButton(language, isExecuting)}
            >
              {isExecuting ? (
                <Spinner className="animate-spin" size={isMobile ? 16 : 14} aria-hidden="true" />
              ) : (
                <PlayIcon size={isMobile ? 16 : 14} aria-hidden="true" />
              )}
              {localize('com_ui_execute')}
            </button>
          )}
        </div>
      </div>

      {/* Code Display */}
      <div 
        className="p-4"
        role="region"
        aria-label={`${language} code block`}
      >
        <MarkdownLite
          content={`\`\`\`${language}\n${code}\n\`\`\``}
          codeExecution={false}
        />
      </div>

      {/* Execution Status */}
      {isExecuting && (
        <div 
          className="border-t border-border-light bg-surface-tertiary px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner className="animate-spin" size={16} aria-hidden="true" />
            {localize('com_ui_executing_code')}...
          </div>
        </div>
      )}

      {/* Results Display */}
      {executionResult && (
        <div 
          className="border-t border-border-light"
          role="region"
          aria-label={executionResult.type === 'success' ? 'Code execution output' : 'Code execution error'}
        >
          <div className="bg-surface-tertiary px-4 py-2">
            <div className="flex items-center gap-2">
              <span 
                className="text-xs font-medium text-text-secondary"
                id={`result-type-${Date.now()}`}
              >
                {executionResult.type === 'success' 
                  ? localize('com_ui_output') 
                  : localize('com_ui_error')
                }
              </span>
              {executionResult.executionTime && (
                <span 
                  className="text-xs text-text-tertiary"
                  aria-label={`Execution time: ${formatExecutionTime(executionResult.executionTime)}`}
                >
                  ({formatExecutionTime(executionResult.executionTime)})
                </span>
              )}
            </div>
          </div>
          
          <div 
            className={cn(
              "px-4 py-3 font-mono text-sm",
              executionResult.type === 'success' 
                ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
            )}
            role={executionResult.type === 'error' ? 'alert' : 'log'}
            aria-labelledby={`result-type-${Date.now()}`}
            tabIndex={0}
          >
            <pre 
              className="whitespace-pre-wrap break-words"
              aria-label={executionResult.type === 'success' ? 'Code output' : 'Error message'}
            >
              {executionResult.type === 'success' 
                ? XSSPrevention.escapeHTML(executionResult.output || '') 
                : XSSPrevention.escapeHTML(executionResult.error || '')
              }
            </pre>
          </div>
        </div>
      )}
      
      {/* Hidden status for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isExecuting ? `Executing ${language} code` : 
         executionResult?.type === 'success' ? 'Code executed successfully' :
         executionResult?.type === 'error' ? 'Code execution failed' :
         'Code ready for execution'}
      </div>

      {/* API Key Dialog */}
      <ApiKeyDialog
        onSubmit={onSubmit}
        isOpen={isDialogOpen}
        register={methods.register}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        handleSubmit={methods.handleSubmit}
        isToolAuthenticated={isAuthenticated}
        isUserProvided={authType === AuthType.USER_PROVIDED}
      />
    </div>
  );
};

export default CodeExecutionRenderer;