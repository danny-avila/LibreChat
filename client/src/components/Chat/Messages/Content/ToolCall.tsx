import { useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { actionDelimiter, actionDomainSeparator, Constants } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';
import ProgressCircle from './ProgressCircle';
import InProgressCall from './InProgressCall';
import Attachment from './Parts/Attachment';
import CancelledIcon from './CancelledIcon';
import ProgressText from './ProgressText';
import FinishedIcon from './FinishedIcon';
import ToolPopover from './ToolPopover';
import WrenchIcon from './WrenchIcon';
import { useProgress } from '~/hooks';
import { logger } from '~/utils';

const radius = 56.08695652173913;
const circumference = 2 * Math.PI * radius;

export default function ToolCall({
  initialProgress = 0.1,
  isSubmitting,
  name,
  args: _args = '',
  output,
  attachments,
  auth,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
  auth?: string;
  expires_at?: number;
}) {
  const localize = useLocalize();
  const { function_name, domain, isMCPToolCall } = useMemo(() => {
    if (typeof name !== 'string') {
      return { function_name: '', domain: null, isMCPToolCall: false };
    }

    if (name.includes(Constants.mcp_delimiter)) {
      const [func, server] = name.split(Constants.mcp_delimiter);
      return {
        function_name: func || '',
        domain: server && (server.replaceAll(actionDomainSeparator, '.') || null),
        isMCPToolCall: true,
      };
    }

    const [func, _domain] = name.includes(actionDelimiter)
      ? name.split(actionDelimiter)
      : [name, ''];
    return {
      function_name: func || '',
      domain: _domain && (_domain.replaceAll(actionDomainSeparator, '.') || null),
      isMCPToolCall: false,
    };
  }, [name]);

  const error =
    typeof output === 'string' && output.toLowerCase().includes('error processing tool');

  const args = useMemo(() => {
    if (typeof _args === 'string') {
      return _args;
    }

    try {
      return JSON.stringify(_args, null, 2);
    } catch (e) {
      logger.error(
        'client/src/components/Chat/Messages/Content/ToolCall.tsx - Failed to stringify args',
        e,
      );
      return '';
    }
  }, [_args]) as string | undefined;

  const hasInfo = useMemo(
    () => (args?.length ?? 0) > 0 || (output?.length ?? 0) > 0,
    [args, output],
  );

  const authDomain = useMemo(() => {
    const authURL = auth ?? '';
    if (!authURL) {
      return '';
    }
    try {
      const url = new URL(authURL);
      return url.hostname;
    } catch (e) {
      return '';
    }
  }, [auth]);

  const progress = useProgress(error === true ? 1 : initialProgress);
  const cancelled = (!isSubmitting && progress < 1) || error === true;
  const offset = circumference - progress * circumference;

  const renderIcon = () => {
    if (progress < 1 && authDomain.length > 0) {
      return (
        <div
          className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-text-secondary"
          style={{ opacity: 1, transform: 'none' }}
          data-projection-id="849"
        >
          <div>
            <ShieldCheck />
          </div>
        </div>
      );
    } else if (progress < 1) {
      return (
        <InProgressCall progress={progress} isSubmitting={isSubmitting} error={error}>
          <div
            className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-white"
            style={{ opacity: 1, transform: 'none' }}
            data-projection-id="849"
          >
            <div>
              <WrenchIcon />
            </div>
            <ProgressCircle radius={radius} circumference={circumference} offset={offset} />
          </div>
        </InProgressCall>
      );
    }

    return cancelled ? <CancelledIcon /> : <FinishedIcon />;
  };

  const getFinishedText = () => {
    if (cancelled) {
      return localize('com_ui_error');
    }
    if (isMCPToolCall === true) {
      return localize('com_assistants_completed_function', { 0: function_name });
    }
    if (domain != null && domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return localize('com_assistants_completed_action', { 0: domain });
    }
    return localize('com_assistants_completed_function', { 0: function_name });
  };

  return (
    <Popover.Root>
      <div className="my-2.5 flex flex-wrap items-center gap-2.5">
        <div className="flex w-full items-center gap-2.5">
          <div className="relative h-5 w-5 shrink-0">{renderIcon()}</div>
          <ProgressText
            progress={cancelled ? 1 : progress}
            inProgressText={localize('com_assistants_running_action')}
            authText={
              !cancelled && authDomain.length > 0 ? localize('com_ui_requires_auth') : undefined
            }
            finishedText={getFinishedText()}
            hasInput={hasInfo}
            popover={true}
          />
          {hasInfo && (
            <ToolPopover
              input={args ?? ''}
              output={output}
              domain={authDomain || (domain ?? '')}
              function_name={function_name}
              pendingAuth={authDomain.length > 0 && !cancelled && progress < 1}
            />
          )}
        </div>
        {auth != null && auth && progress < 1 && !cancelled && (
          <div className="flex w-full flex-col gap-2.5">
            <div className="mb-1 mt-2">
              <a
                className="inline-flex items-center justify-center gap-2 rounded-3xl bg-surface-tertiary px-4 py-2 text-sm font-medium hover:bg-surface-hover"
                href={auth}
                target="_blank"
                rel="noopener noreferrer"
              >
                {localize('com_ui_sign_in_to_domain', { 0: authDomain })}
              </a>
            </div>
            <p className="flex items-center text-xs text-text-secondary">
              <TriangleAlert className="mr-1.5 inline-block h-4 w-4" />
              {localize('com_assistants_allow_sites_you_trust')}
            </p>
          </div>
        )}
      </div>
      {attachments?.map((attachment, index) => <Attachment attachment={attachment} key={index} />)}
    </Popover.Root>
  );
}
