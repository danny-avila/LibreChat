import { memo, useMemo } from 'react';
import { ThinkingContent } from '~/components/Artifacts/Thinking';

type ReasoningProps = {
  reasoning: string;
};

const Reasoning = memo(({ reasoning }: ReasoningProps) => {
  const reasoningText = useMemo(() => {
    return reasoning.replace(/^<think>\s*/, '').replace(/\s*<\/think>$/, '');
  }, [reasoning]);
  return <ThinkingContent>{reasoningText}</ThinkingContent>;
});

export default Reasoning;
