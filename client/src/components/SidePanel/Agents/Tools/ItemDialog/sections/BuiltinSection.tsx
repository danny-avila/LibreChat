import { Radio } from '@librechat/client';
import { useFormContext, useWatch } from 'react-hook-form';
import { Tools, ArtifactModes, AgentCapabilities } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { AgentForm, ExtendedFile } from '~/common';
import type { BuiltinId } from '../../items/types';
import { useVerifyAgentToolAuth } from '~/data-provider';
import SearchAction from '../../../Search/Action';
import FileContext from '../../../FileContext';
import FileSearch from '../../../FileSearch';
import CodeFiles from '../../../Code/Files';
import { useLocalize } from '~/hooks';

interface Props {
  builtinId: BuiltinId;
  agentId: string;
  contextFiles: Array<[string, ExtendedFile]>;
  knowledgeFiles: Array<[string, ExtendedFile]>;
  codeFiles: Array<[string, ExtendedFile]>;
  description?: string;
}

const ARTIFACT_MODES: Array<{
  value: string;
  labelKey: TranslationKeys;
  infoKey?: TranslationKeys;
}> = [
  {
    value: ArtifactModes.DEFAULT,
    labelKey: 'com_ui_artifacts_mode_default',
    infoKey: 'com_ui_artifacts_mode_default_info',
  },
  {
    value: ArtifactModes.SHADCNUI,
    labelKey: 'com_ui_artifacts_mode_shadcn',
    infoKey: 'com_ui_artifacts_mode_shadcn_info',
  },
  {
    value: ArtifactModes.CUSTOM,
    labelKey: 'com_ui_artifacts_mode_custom',
    infoKey: 'com_ui_artifacts_mode_custom_info',
  },
];

interface ArtifactsConfigProps {
  value: string;
  onChange: (next: string) => void;
}

function ArtifactsConfig({ value, onChange }: ArtifactsConfigProps) {
  const localize = useLocalize();
  const options = ARTIFACT_MODES.map((mode) => ({
    value: mode.value,
    label: localize(mode.labelKey),
  }));
  const active = ARTIFACT_MODES.find((mode) => mode.value === value);

  return (
    <div className="flex flex-col gap-3">
      <span id="artifacts-mode-label" className="text-sm font-medium text-text-primary">
        {localize('com_ui_artifacts_mode')}
      </span>
      <Radio
        options={options}
        value={value}
        onChange={onChange}
        fullWidth
        aria-labelledby="artifacts-mode-label"
      />
      {active?.infoKey ? (
        <p className="text-sm leading-relaxed text-text-secondary">{localize(active.infoKey)}</p>
      ) : null}
    </div>
  );
}

function WebSearchConfig() {
  const { data } = useVerifyAgentToolAuth({ toolId: Tools.web_search }, { retry: 1 });
  return <SearchAction authTypes={data?.authTypes} isToolAuthenticated={data?.authenticated} />;
}

export default function BuiltinSection({
  builtinId,
  agentId,
  contextFiles,
  knowledgeFiles,
  codeFiles,
  description,
}: Props) {
  const localize = useLocalize();
  const { control, setValue } = useFormContext<AgentForm>();

  const artifactsValue = (useWatch({ control, name: AgentCapabilities.artifacts }) ?? '') as string;

  let body: React.ReactNode = null;

  if (builtinId === 'execute_code') {
    body = <CodeFiles agent_id={agentId} files={codeFiles} />;
  } else if (builtinId === 'web_search') {
    body = <WebSearchConfig />;
  } else if (builtinId === 'file_search') {
    body = <FileSearch agent_id={agentId} files={knowledgeFiles} showHeader={false} />;
  } else if (builtinId === 'artifacts') {
    body = (
      <ArtifactsConfig
        value={artifactsValue}
        onChange={(next) => setValue(AgentCapabilities.artifacts, next, { shouldDirty: true })}
      />
    );
  } else if (builtinId === 'context') {
    body = <FileContext agent_id={agentId} files={contextFiles} showHeader={false} />;
  }

  const localizedDescription = description ? localize(description as TranslationKeys) : '';

  return (
    <div className="flex flex-col gap-5">
      {localizedDescription && (
        <p className="text-sm leading-relaxed text-text-secondary">{localizedDescription}</p>
      )}
      {body}
    </div>
  );
}
