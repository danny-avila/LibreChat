import { Button } from '@librechat/client';
import { useRouteError } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import logger from '~/utils/logger';

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<{ platform: string; platformVersion: string }>;
}

type PlatformInfo = {
  os: string;
  version?: string;
};

const formatStackTrace = (stack: string) => {
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({
      number: i + 1,
      content: line,
    }));
};

const getPlatformInfo = async (): Promise<PlatformInfo> => {
  if ('userAgentData' in navigator) {
    try {
      const ua = navigator.userAgentData as UserAgentData;
      const highEntropyValues = await ua.getHighEntropyValues(['platform', 'platformVersion']);
      return {
        os: highEntropyValues.platform,
        version: highEntropyValues.platformVersion,
      };
    } catch (e) {
      logger.warn('Failed to get high entropy values');
      logger.error(e);
    }
  }

  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac')) {
    return { os: 'macOS' };
  }
  if (userAgent.includes('win')) {
    return { os: 'Windows' };
  }
  if (userAgent.includes('linux')) {
    return { os: 'Linux' };
  }
  if (userAgent.includes('android')) {
    return { os: 'Android' };
  }
  if (userAgent.includes('ios') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
    return { os: 'iOS' };
  }

  return { os: 'Unknown' };
};

const getBrowserInfo = async () => {
  const platformInfo = await getPlatformInfo();
  return {
    userAgent: navigator.userAgent,
    platform: platformInfo.os,
    platformVersion: platformInfo.version,
    language: navigator.language,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
  };
};

export default function RouteErrorBoundary() {
  const localize = useLocalize();
  const typedError = useRouteError() as {
    message?: string;
    stack?: string;
    status?: number;
    statusText?: string;
    data?: unknown;
  };

  const errorDetails = {
    message: typedError.message ?? 'An unexpected error occurred',
    stack: typedError.stack,
    status: typedError.status,
    statusText: typedError.statusText,
    data: typedError.data,
  };

  const handleDownloadLogs = async () => {
    try {
      const browser = await getBrowserInfo();
      const errorLog = {
        timestamp: new Date().toISOString(),
        browser,
        error: {
          ...errorDetails,
          stack:
            errorDetails.stack != null && errorDetails.stack.trim() !== ''
              ? formatStackTrace(errorDetails.stack)
              : undefined,
        },
      };

      const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-log-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.warn('Failed to download error logs:');
      logger.error(e);
    }
  };

  const handleCopyStack = async () => {
    if (errorDetails.stack != null && errorDetails.stack !== '') {
      await navigator.clipboard.writeText(errorDetails.stack);
    }
  };

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center bg-surface-primary bg-gradient-to-br"
    >
      <div className="bg-surface-primary/60 mx-4 w-11/12 max-w-4xl rounded-2xl border border-border-light p-8 shadow-2xl backdrop-blur-xl">
        <h2 className="mb-6 text-center text-3xl font-medium tracking-tight text-text-primary">
          {localize('com_ui_error_unexpected')}
        </h2>

        {/* Error Message */}
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-gray-600 dark:text-gray-200">
          <h3 className="mb-2 font-medium">{localize('com_ui_error_message_prefix')}</h3>
          <pre className="whitespace-pre-wrap text-sm font-light leading-relaxed text-text-primary">
            {errorDetails.message}
          </pre>
        </div>

        {/* Status Information */}
        {(typeof errorDetails.status === 'number' ||
          typeof errorDetails.statusText === 'string') && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-text-primary">
            <h3 className="mb-2 font-medium">{localize('com_ui_status_prefix')}:</h3>
            <p className="text-text-primary">
              {typeof errorDetails.status === 'number' && `${errorDetails.status} `}
              {typeof errorDetails.statusText === 'string' && errorDetails.statusText}
            </p>
          </div>
        )}

        {/* Stack Trace - Collapsible */}
        {errorDetails.stack != null && errorDetails.stack.trim() !== '' && (
          <details className="group mb-4 rounded-xl border border-border-light p-4">
            <summary className="mb-2 flex cursor-pointer items-center justify-between text-sm font-medium text-text-primary">
              <span>{localize('com_ui_stack_trace')}</span>
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyStack}
                  className="ml-2 px-2 py-1 text-xs"
                  aria-label={localize('com_ui_copy_stack_trace')}
                >
                  {localize('com_ui_copy')}
                </Button>
              </div>
            </summary>
            <div className="overflow-x-auto rounded-lg bg-black/5 p-4 dark:bg-white/5">
              {formatStackTrace(errorDetails.stack).map(({ number, content }) => (
                <div key={number} className="flex">
                  <span className="select-none pr-4 font-mono text-xs text-text-secondary">
                    {String(number).padStart(3, '0')}
                  </span>
                  <pre className="flex-1 font-mono text-xs leading-relaxed text-text-primary">
                    {content}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Additional Error Data */}
        {errorDetails.data != null && (
          <details className="group mb-4 rounded-xl border border-border-light p-4">
            <summary className="mb-2 flex cursor-pointer items-center justify-between text-sm font-medium text-text-primary">
              <span>{localize('com_ui_additional_details')}</span>
              <span className="transition-transform group-open:rotate-90">{'>'}</span>
            </summary>
            <pre className="whitespace-pre-wrap text-xs font-light leading-relaxed text-text-primary">
              {JSON.stringify(errorDetails.data, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm font-light text-text-secondary">
            {localize('com_ui_error_try_following_prefix')}:
          </p>
          <ul className="list-inside list-disc text-sm text-text-secondary">
            <li>{localize('com_ui_refresh_page')}</li>
            <li>{localize('com_ui_clear_browser_cache')}</li>
            <li>{localize('com_ui_check_internet')}</li>
            <li>{localize('com_ui_contact_admin_if_issue_persists')}</li>
          </ul>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              variant="submit"
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto"
              aria-label={localize('com_ui_refresh_page')}
            >
              {localize('com_ui_refresh_page')}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadLogs}
              className="w-full sm:w-auto"
              aria-label={localize('com_ui_download_error_logs')}
            >
              {localize('com_ui_download_error_logs')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
