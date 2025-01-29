import { memo, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { ThinkingContent } from '~/components/Artifacts/Thinking';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';

type ReasoningProps = {
  reasoning: string;
};

const Reasoning = memo(({ reasoning }: ReasoningProps) => {
  const { isExpanded, nextType } = useMessageContext();
  const reasoningText = useMemo(() => {
    return reasoning.replace(/^<think>\s*/, '').replace(/\s*<\/think>$/, '');
  }, [reasoning]);

  return (
    <div
      className={cn(
        'grid transition-all duration-300 ease-out',
        nextType !== ContentTypes.THINK && isExpanded && 'mb-10',
      )}
      style={{
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
      }}
    >
      <div className="overflow-hidden">
        <ThinkingContent isPart={true}>{reasoningText}</ThinkingContent>
      </div>
    </div>
  );
});

export default Reasoning;
