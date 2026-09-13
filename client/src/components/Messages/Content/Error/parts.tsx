import { useContext, useId, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@librechat/client';
import { alternateName, getEndpointField } from 'librechat-data-provider';
import type { EModelEndpoint, TEndpointsConfig, TMessage } from 'librechat-data-provider';
import { isUserProvidedEndpointConfig } from '~/components/Nav/SettingsTabs/ProviderKeys/utils';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { supportsCompaction } from '~/hooks/Chat/useCompactConversation';
import { ChatContext } from '~/Providers/ChatContext';
import { useExpandCollapse, useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** A parsed error payload. Producers are free-form, so every field is read defensively. */
export type ErrorPayload = Record<string, unknown>;

export type ErrorRendererProps = {
  /** The payload parsed out of the message text. */
  json: ErrorPayload;
  /** The message text as persisted, including any prefix around the payload. */
  text: string;
  /** The row this error belongs to; absent when an error content part renders on its own. */
  message?: TMessage;
};

/** The fallback renderer also runs when there is no payload at all. */
export type UnclassifiedErrorProps = Omit<ErrorRendererProps, 'json'> & { json?: ErrorPayload };

export function readString(json: ErrorPayload | undefined, key: string): string | undefined {
  const value = json?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readNumber(json: ErrorPayload | undefined, key: string): number | undefined {
  const value = json?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  /** Limiter payloads cross the wire as JSON, but a stored `max` may be a numeric string. */
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export type ErrorEndpoint = {
  /** Endpoint id (`openAI`, `anthropic`, an agents endpoint, …) when it is knowable. */
  endpoint?: string;
  endpointType?: EModelEndpoint;
  /** Display name for the provider; undefined when the endpoint cannot be resolved. */
  provider?: string;
  /** Display name for the model or agent that produced the failure. */
  model?: string;
  /** The endpoint takes its key from the user rather than from the deployment. */
  userProvidesKey: boolean;
  /** Manual context compaction can be triggered for this conversation. */
  compactionAvailable: boolean;
  endpointsConfig?: TEndpointsConfig;
};

/**
 * Resolves who produced the failure.
 *
 * Error content renders in the chat, in search results and in shared links. Only the chat surface
 * mounts `ChatContext`, and a shared link is read by a viewer whose query client is not
 * authenticated, so the endpoint queries stay disabled outside the chat rather than firing a
 * request that would resolve to a login redirect. Copy therefore has to work without a provider
 * name, which is why `provider` and `model` are optional.
 */
export function useErrorEndpoint(message?: TMessage): ErrorEndpoint {
  const chat = useContext(ChatContext);
  const inChat = chat != null;
  const { data: endpointsConfig } = useGetEndpointsQuery({ enabled: inChat });
  const { data: startupConfig } = useGetStartupConfig({ enabled: inChat });

  const endpoint = message?.endpoint ?? chat?.conversation?.endpoint ?? undefined;
  const model = message?.model ?? chat?.conversation?.model ?? undefined;

  return useMemo(() => {
    const endpointType = endpoint
      ? (getEndpointField(endpointsConfig, endpoint, 'type') as EModelEndpoint | undefined)
      : undefined;
    return {
      endpoint: endpoint ?? undefined,
      endpointType,
      provider: endpoint
        ? ((alternateName[endpoint] as string | undefined) ?? endpoint)
        : undefined,
      model: model ?? undefined,
      userProvidesKey: endpoint ? isUserProvidedEndpointConfig(endpointsConfig?.[endpoint]) : false,
      compactionAvailable:
        startupConfig?.compactionEnabled === true && supportsCompaction(endpoint),
      endpointsConfig,
    };
  }, [endpoint, model, endpointsConfig, startupConfig?.compactionEnabled]);
}

/** Stacks an error's sentences, details and actions without inheriting prose spacing. */
export function ErrorBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

/**
 * Secondary information a reader only wants after the headline: a provider's own message, a token
 * budget, a generation breakdown. Collapsed by default and rendered as text rather than through
 * `CodeBlock`, which frames a detail in a code bar and a dark slab that reads as output.
 *
 * Motion is `useExpandCollapse`, the same `grid-template-rows` tween the tool rows and activity
 * phases in the transcript use, so a detail inside an error box opens on the curve the rest of the
 * message content already moves on (and inherits its reduced-motion and `inert` handling).
 *
 * The body stays mounted while collapsed. That is what makes the card resize rather than jump: a
 * collapsed row still contributes its width to the box's intrinsic size, so the box only ever
 * changes height, and it changes it on the tween instead of in one step. The gap to the trigger
 * lives inside the animated element for the same reason — as a margin outside it, it would appear
 * in a single step once the height reached zero.
 */
export function ErrorDetails({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { style: panelStyle, ref: panelRef } = useExpandCollapse(open);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((expanded) => !expanded)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1 rounded-md text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
      >
        {label}
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
            open && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>
      <div id={panelId} style={panelStyle} aria-hidden={!open}>
        <div ref={panelRef} className="overflow-hidden">
          <div className="mt-1 whitespace-pre-wrap break-words text-xs text-text-secondary">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** The one thing a reader can do about the failure, next to the sentence explaining it. */
export function ErrorAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    /** One step tighter than the button default (8px) so the control reads as nested inside the
     *  error card's 12px corner rather than echoing it. */
    <Button type="button" size="sm" className="rounded-md" onClick={onClick}>
      {children}
    </Button>
  );
}

export const formatNumber = (value: number): string => new Intl.NumberFormat().format(value);

/** Token credits are a float balance; two decimals, matching the balance settings row. */
export const formatCredits = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

/** A stored timestamp is an ISO string or epoch ms; anything unparseable is shown verbatim. */
export function formatTimestamp(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

/** `m:ss`, or `h:mm:ss` past an hour — the shape a countdown is read in. */
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "minute" or "45 minutes", for limit copy that ends in "per …". */
export function useWindowLabel(windowInMinutes?: number): string | undefined {
  const localize = useLocalize();
  if (windowInMinutes == null) {
    return undefined;
  }
  return windowInMinutes === 1
    ? localize('com_error_window_minute')
    : localize('com_error_window_minutes', { 0: formatNumber(windowInMinutes) });
}
