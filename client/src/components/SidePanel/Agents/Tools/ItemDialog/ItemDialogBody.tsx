import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { ExtendedFile, AgentForm } from '~/common';
import type { AgentItem } from '../items/types';
import BuiltinSection from './sections/BuiltinSection';
import ToolSection from './sections/ToolSection';
import SkillSection from './sections/SkillSection';
import McpSection from './sections/McpSection';
import ActionSection from './sections/ActionSection';

interface Props {
  item: AgentItem;
  agentId: string;
  onClose: () => void;
}

export default function ItemDialogBody({ item, agentId, onClose }: Props) {
  const { control } = useFormContext<AgentForm>();
  const agent = useWatch({ control, name: 'agent' });

  const contextFiles = useMemo(
    () => (agent?.context_files ?? []) as Array<[string, ExtendedFile]>,
    [agent?.context_files],
  );
  const knowledgeFiles = useMemo(
    () => (agent?.knowledge_files ?? []) as Array<[string, ExtendedFile]>,
    [agent?.knowledge_files],
  );
  const codeFiles = useMemo(
    () => (agent?.code_files ?? []) as Array<[string, ExtendedFile]>,
    [agent?.code_files],
  );

  if (item.kind === 'builtin') {
    return (
      <BuiltinSection
        builtinId={item.id}
        agentId={agentId}
        contextFiles={contextFiles}
        knowledgeFiles={knowledgeFiles}
        codeFiles={codeFiles}
        description={item.description}
      />
    );
  }
  if (item.kind === 'tool') {
    return <ToolSection item={item} />;
  }
  if (item.kind === 'skill') {
    return <SkillSection item={item} />;
  }
  if (item.kind === 'mcp') {
    return <McpSection item={item} />;
  }
  return <ActionSection item={item} agentId={agentId} onClose={onClose} />;
}
