import { alternateName } from 'librechat-data-provider';
import type { Agent, TFile } from 'librechat-data-provider';
import type { DropdownValueSetter, TAgentOption } from '~/common';

/**
 * Creates a Dropdown value setter that always passes a string value,
 * for when options (object with label/value fields) are used for the
 * available values, and a string value is expected when selected.
 *
 * Only necessary when the available values are objects with label/value fields
 * and the selected value is expected to be a string.
 **/
export const createDropdownSetter = (setValue: (value: string) => void): DropdownValueSetter => {
  return (value) => {
    if (!value) {
      setValue('');
      return;
    }

    if (typeof value === 'string') {
      setValue(value);
      return;
    }

    if (value.value) {
      setValue(value.value + '');
    }
  };
};

/**
 * Creates an Option object for a provider dropdown.
 **/
export const createProviderOption = (provider: string) => ({
  label: (alternateName[provider] as string | undefined) ?? provider,
  value: provider,
});

type FileTuple = [string, Partial<TFile>];
type FileList = Array<FileTuple>;

export const processAgentOption = (
  _agent?: Agent,
  fileMap?: Record<string, TFile>,
): TAgentOption => {
  const agent: TAgentOption = {
    ...(_agent ?? ({} as Agent)),
    label: _agent?.name ?? '',
    value: _agent?.id ?? '',
    // files: _agent?.file_ids ? ([] as FileList) : undefined,
    // code_files: _agent?.tool_resources?.code_interpreter?.file_ids
    //   ? ([] as FileList)
    //   : undefined,
  };

  if (!fileMap) {
    return agent;
  }

  const handleFile = (file_id: string, list?: FileList) => {
    const file = fileMap?.[file_id];
    if (file) {
      list?.push([file_id, file]);
    } else {
      list?.push([
        file_id,
        {
          file_id,
          type: '',
          filename: '',
          bytes: 1,
          // progress: 1,
          // TODO: file handling
          // filepath: endpoint,
        },
      ]);
    }
  };

  if (agent.files && _agent?.file_ids) {
    _agent.file_ids.forEach((file_id) => handleFile(file_id, agent.files));
  }

  if (agent.code_files && _agent?.tool_resources?.code_interpreter?.file_ids) {
    _agent.tool_resources?.code_interpreter?.file_ids?.forEach((file_id) =>
      handleFile(file_id, agent.code_files),
    );
  }

  return agent;
};
