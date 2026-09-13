import { useEffect, useState } from 'react';
import { ViolationTypes } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import type { ErrorRendererProps } from './parts';
import {
  ErrorBody,
  formatDuration,
  formatNumber,
  readNumber,
  readString,
  useWindowLabel,
} from './parts';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type RetryTargetInput = {
  type: string | undefined;
  resetAt?: number;
  retryAfterSeconds?: number;
  createdAt?: string | Date;
};

function getCreatedAtMs(createdAt?: string | Date): number | undefined {
  if (createdAt == null) {
    return undefined;
  }
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function resolveRetryTarget({
  type,
  resetAt,
  retryAfterSeconds,
  createdAt,
}: RetryTargetInput): number | undefined {
  if (type !== ViolationTypes.MESSAGE_LIMIT) {
    return undefined;
  }

  const target =
    resetAt ??
    (retryAfterSeconds != null && createdAt != null
      ? (getCreatedAtMs(createdAt) ?? Number.NaN) + retryAfterSeconds * 1000
      : undefined);
  if (target == null || !Number.isFinite(target)) {
    return undefined;
  }

  const now = Date.now();
  return target > now + DAY_IN_MS || target < now - DAY_IN_MS ? undefined : target;
}

/** Keeps a rate-limit countdown local to the rendered error row. */
function useRetryCountdown(target?: number): number | undefined {
  const [remaining, setRemaining] = useState<number | undefined>(() =>
    target == null ? undefined : Math.max(0, target - Date.now()),
  );

  useEffect(() => {
    if (target == null) {
      setRemaining(undefined);
      return;
    }

    const tick = () => {
      const next = target - Date.now();
      setRemaining(Math.max(0, next));
      return next;
    };

    if (tick() <= 0) {
      return;
    }

    const timer = setInterval(() => {
      if (tick() <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [target]);

  if (target == null) {
    return undefined;
  }
  return remaining ?? Math.max(0, target - Date.now());
}

export default function LimitError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const type = readString(json, 'type');
  const createdAt = message?.createdAt as string | Date | undefined;
  const max = readNumber(json, 'max');
  const limit = readNumber(json, 'limit');
  const windowInMinutes = readNumber(json, 'windowInMinutes');
  const windowLabel = useWindowLabel(windowInMinutes);
  const resetAt = readNumber(json, 'resetAt');
  const retryAfterSeconds = readNumber(json, 'retryAfterSeconds');
  const retryTarget = resolveRetryTarget({
    type,
    resetAt,
    retryAfterSeconds,
    createdAt,
  });
  const remaining = useRetryCountdown(retryTarget);

  let headline: string;
  switch (type) {
    case ViolationTypes.MESSAGE_LIMIT:
      if (windowLabel == null) {
        headline = localize('com_error_limit_reached');
      } else if (max === 1) {
        headline = localize('com_error_message_limit_one', { 0: windowLabel });
      } else if (max != null) {
        headline = localize('com_error_message_limit', {
          0: formatNumber(max),
          1: windowLabel,
        });
      } else {
        headline = localize('com_error_limit_reached');
      }
      break;
    case ViolationTypes.CONCURRENT:
      headline =
        limit != null && limit > 1
          ? localize('com_error_concurrent', { 0: formatNumber(limit) })
          : localize('com_error_concurrent_one');
      break;
    case ViolationTypes.FILE_UPLOAD_LIMIT:
      headline =
        max != null && windowLabel != null
          ? localize('com_error_file_upload_limit', {
              0: formatNumber(max),
              1: windowLabel,
            })
          : localize('com_error_limit_reached');
      break;
    case ViolationTypes.TTS_LIMIT:
      headline =
        max != null && windowLabel != null
          ? localize('com_error_tts_limit', { 0: formatNumber(max), 1: windowLabel })
          : localize('com_error_limit_reached');
      break;
    case ViolationTypes.STT_LIMIT:
      headline =
        max != null && windowLabel != null
          ? localize('com_error_stt_limit', { 0: formatNumber(max), 1: windowLabel })
          : localize('com_error_limit_reached');
      break;
    default:
      headline = localize('com_error_limit_reached');
  }

  return (
    <ErrorBody>
      <p>{headline}</p>
      {retryTarget != null && remaining != null && (
        <p className="text-text-secondary">
          {remaining > 0
            ? localize('com_error_retry_countdown', { 0: formatDuration(remaining) })
            : localize('com_error_retry_available')}
        </p>
      )}
    </ErrorBody>
  );
}
