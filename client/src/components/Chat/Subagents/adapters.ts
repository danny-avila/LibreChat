import { ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  PartMetadata,
  SubagentActivityItem,
  SubagentThreadStatus,
  SubagentThreadView,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { SubagentProgress } from '~/store/subagents';

export type ChildActivityItem =
  | {
      type: 'writing';
      text: string;
      textTruncated?: boolean;
    }
  | {
      type: 'reasoning';
      text?: string;
    }
  | {
      type: 'tool';
      toolCallId: string;
      name: string;
      input?: string | Record<string, unknown>;
      output?: string;
      status: 'running' | 'completed' | 'failed' | 'cancelled';
      approval?: Agents.ToolCall['approval'];
      inputTruncated?: boolean;
      outputTruncated?: boolean;
    };

export type ChildActivity = {
  title: string;
  prompt?: string;
  status: SubagentThreadStatus;
  items: ChildActivityItem[];
  activityTruncated?: boolean;
};

type ContentToolCall = {
  id?: string;
  args?: string | Record<string, unknown>;
  output?: string;
  name?: string;
  progress?: number;
  runStepStatus?: PartMetadata['runStepStatus'];
  approval?: Agents.ToolCall['approval'];
};

const contentPartsToActivity = (
  parts: TMessageContentParts[],
  reasoningVisibility: 'visible' | 'marker',
  approvalVisibility: 'visible' | 'hidden',
): ChildActivityItem[] =>
  parts.flatMap((part, index): ChildActivityItem[] => {
    if (part.type === ContentTypes.TEXT) {
      return [{ type: 'writing', text: (part as { text: string }).text }];
    }
    if (part.type === ContentTypes.THINK) {
      return [
        {
          type: 'reasoning',
          ...(reasoningVisibility === 'visible' ? { text: (part as { think: string }).think } : {}),
        },
      ];
    }
    if (part.type !== ContentTypes.TOOL_CALL) return [];
    const tool = (part as { [ContentTypes.TOOL_CALL]?: ContentToolCall })[ContentTypes.TOOL_CALL];
    if (tool == null) return [];
    const runStepStatus =
      (part as { runStepStatus?: PartMetadata['runStepStatus'] }).runStepStatus ??
      tool.runStepStatus;
    const waitingForApproval =
      tool.approval != null &&
      (tool.output?.length ?? 0) === 0 &&
      (tool.progress ?? 0) < 1 &&
      runStepStatus == null;
    const completed = !waitingForApproval && ((tool.progress ?? 0) >= 1 || tool.output != null);
    return [
      {
        type: 'tool',
        toolCallId: tool.id ?? `tool-${index}`,
        name: tool.name ?? '',
        ...(tool.args == null ? {} : { input: tool.args }),
        ...(tool.output == null ? {} : { output: tool.output }),
        status: runStepStatus ?? (completed ? 'completed' : 'running'),
        ...(tool.approval == null || approvalVisibility === 'hidden'
          ? {}
          : { approval: tool.approval }),
      },
    ];
  });

const publicActivityToChildActivity = (items: SubagentActivityItem[]): ChildActivityItem[] =>
  items.map((item) => {
    if (item.type !== 'tool') return item;
    return {
      ...item,
      ...(item.input == null ? {} : { input: item.input }),
    };
  });

const liveStatus = ({
  progress,
  initialProgress,
  isSubmitting,
  runStepStatus,
}: {
  progress: SubagentProgress | null;
  initialProgress: number;
  isSubmitting: boolean;
  runStepStatus?: PartMetadata['runStepStatus'];
}): SubagentThreadStatus => {
  if (runStepStatus === 'cancelled') return 'cancelled';
  if (runStepStatus === 'failed' || progress?.status === 'error') return 'failed';
  if (runStepStatus != null || initialProgress >= 1 || progress?.status === 'stop') {
    return 'completed';
  }
  return isSubmitting ? 'running' : 'cancelled';
};

/** Adapts live SSE state, parent persistence, and legacy output at one seam. */
export function adaptLivePersistedActivity(input: {
  title: string;
  prompt?: string;
  progress: SubagentProgress | null;
  persistedContent?: TMessageContentParts[];
  legacyOutput?: string | null;
  initialProgress: number;
  isSubmitting: boolean;
  runStepStatus?: PartMetadata['runStepStatus'];
  reasoningVisibility?: 'visible' | 'marker';
  approvalVisibility?: 'visible' | 'hidden';
}): ChildActivity {
  const persisted = input.persistedContent ?? [];
  const live = (input.progress?.contentParts ?? []) as TMessageContentParts[];
  const parts = persisted.length > 0 ? persisted : live;
  const items = contentPartsToActivity(
    parts,
    input.reasoningVisibility ?? 'visible',
    input.approvalVisibility ?? 'visible',
  );
  if (items.length === 0 && input.legacyOutput != null && input.legacyOutput !== '') {
    items.push({ type: 'writing', text: input.legacyOutput });
  }
  return {
    title: input.title,
    ...(input.prompt == null ? {} : { prompt: input.prompt }),
    status: liveStatus(input),
    items,
  };
}

/** Adapts the bounded parent-authorized child view without exposing its storage shape. */
export function adaptDurableThreadActivity(
  view: SubagentThreadView,
  taskId: string,
): ChildActivity {
  const prompt = view.messages.find((message) => message.messageId === `${taskId}:user`)?.text;
  const response = view.messages.find((message) => message.messageId === `${taskId}:assistant`);
  // Tolerate a briefly mixed-version deployment where an older API replica
  // returns the pre-projection view shape.
  const hasProjectedActivity = Array.isArray(view.activity);
  const items = publicActivityToChildActivity(view.activity ?? []);
  if (items.length === 0 && response?.text != null && response.text !== '') {
    items.push({
      type: 'writing',
      text: response.text,
      ...(response.textTruncated === true ? { textTruncated: true } : {}),
    });
  }
  let status = view.status;
  if (!hasProjectedActivity && response != null) {
    status = response.error === true ? 'failed' : 'completed';
  }
  return {
    title: view.title,
    ...(prompt == null ? {} : { prompt }),
    status,
    items,
    activityTruncated: view.activityTruncated || view.historyTruncated,
  };
}
