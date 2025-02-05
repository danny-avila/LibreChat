import { useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
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

export default function ToolCall({
  initialProgress = 0.1,
  isSubmitting,
  name,
  args: _args = '',
  output,
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const progress = useProgress(initialProgress);
  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

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

  const error = typeof output === 'string' && output.toLowerCase().includes('error processing tool');
  const needsLogin =
      typeof output === 'string' &&
      (output.toLowerCase().includes('no access token') ||
          output.toLowerCase().includes('expired token'));

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

  const renderIcon = () => {
    if (progress < 1) {
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

    return error === true ? <CancelledIcon /> : <FinishedIcon />;
  };

  const getFinishedText = () => {
    if (isMCPToolCall === true) {
      return localize('com_assistants_completed_function', function_name);
    }
    if (domain != null && domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH) {
      return localize('com_assistants_completed_action', domain);
    }
    return localize('com_assistants_completed_function', function_name);
  };

  return (
    <Popover.Root>
      <div className="my-2.5 flex items-center gap-2.5">
        <div className="relative h-5 w-5 shrink-0">{renderIcon()}</div>
        <ProgressText
          progress={progress}
          onClick={() => ({})}
          inProgressText={localize('com_assistants_running_action')}
          finishedText={getFinishedText()}
          hasInput={hasInfo}
          popover={true}
        />
        {hasInfo && (
          <ToolPopover
            input={args ?? ''}
            output={output}
            domain={domain ?? ''}
            function_name={function_name}
          />
        )}

        {/*TODO: fix hardcoded action_id*/}
        {needsLogin && 'Ty2HxVutaMeSDbxkryip6' && (
          <div className="pl-7 flex flex-col">
            <div className="text-sm text-gray-600 mb-1">
              {/* Here we use the original domain value */}
              {localize('com_assistants_wants_to_talk', domain ?? '' )}
            </div>
            <a
              className="inline-flex w-fit items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              href={'/api/actions/Ty2HxVutaMeSDbxkryip6/oauth/login'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* And here as well */}
              {localize('com_assistants_sign_in_with_domain', domain ?? '')}
            </a>
            <p className="mt-1 text-xs text-gray-500">
              {localize('com_assistants_allow_sites_you_trust')}
            </p>
          </div>
        )}
      </div>
      {attachments?.map((attachment, index) => (
        <Attachment attachment={attachment} key={index} />
      ))}
    </Popover.Root>
  );
}
