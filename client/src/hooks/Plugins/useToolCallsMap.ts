import { ToolCallResult } from 'librechat-data-provider';
import { useMemo } from 'react';
import { useGetToolCalls } from '~/data-provider';
import { mapToolCalls, logger } from '~/utils';

type ToolCallsMap = {
  [x: string]: ToolCallResult[] | undefined;
};

export default function useToolCallsMap({
  conversationId,
}: {
  conversationId: string;
}): ToolCallsMap | undefined {
  const { data: toolCallsMap = null } = useGetToolCalls(
    { conversationId },
    {
      select: (res) => mapToolCalls(res),
    },
  );

  const result = useMemo<ToolCallsMap | undefined>(() => {
    return toolCallsMap !== null ? toolCallsMap : undefined;
  }, [toolCallsMap]);

  logger.log('tools', 'tool calls map:', result);
  return result;
}
