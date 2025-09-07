import React, { useMemo } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { ImageUpIcon, FileSearch, TerminalSquareIcon, FileType2Icon } from 'lucide-react';
import { EToolResources, defaultAgentCapabilities, Tools } from 'librechat-data-provider';
import { useLocalize, useGetAgentsConfig, useAgentCapabilities } from '~/hooks';
import { useChatContext, useAgentsMapContext } from '~/Providers';
import { useGetAgentByIdQuery } from '~/data-provider';

interface DragDropModalProps {
  onOptionSelect: (option: EToolResources | undefined) => void;
  files: File[];
  isVisible: boolean;
  setShowModal: (showModal: boolean) => void;
}

interface FileOption {
  label: string;
  value?: EToolResources;
  icon: React.JSX.Element;
  condition?: boolean;
}

const DragDropModal = ({ onOptionSelect, setShowModal, files, isVisible }: DragDropModalProps) => {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  /** TODO: Ephemeral Agent Capabilities
   * Allow defining agent capabilities on a per-endpoint basis
   * Use definition for agents endpoint for ephemeral agents
   * */
  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const agentSelected = Boolean(conversation?.agent_id);
  const selectedAgent = agentSelected ? agentsMap?.[conversation!.agent_id as string] : undefined;
  const agentId = (conversation?.agent_id as string) || '';
  const { data: agentData } = useGetAgentByIdQuery(agentId, { enabled: agentSelected });
  const tools = (agentData?.tools as string[] | undefined) || (selectedAgent?.tools as string[] | undefined);

  const fileSearchAllowedByAgent = (() => {
    if (!agentSelected) return true;
    if (!selectedAgent) return false;
    return tools?.includes(Tools.file_search) ?? false;
  })();

  const codeAllowedByAgent = (() => {
    if (!agentSelected) return true;
    if (!selectedAgent) return false;
    return tools?.includes(Tools.execute_code) ?? false;
  })();
  const options = useMemo(() => {
    const _options: FileOption[] = [
      {
        label: localize('com_ui_upload_image_input'),
        value: undefined,
        icon: <ImageUpIcon className="icon-md" />,
        condition: files.every((file) => file.type?.startsWith('image/')),
      },
    ];
    if (capabilities.fileSearchEnabled && fileSearchAllowedByAgent) {
      _options.push({
        label: localize('com_ui_upload_file_search'),
        value: EToolResources.file_search,
        icon: <FileSearch className="icon-md" />,
      });
    }
    if (capabilities.codeEnabled && codeAllowedByAgent) {
      _options.push({
        label: localize('com_ui_upload_code_files'),
        value: EToolResources.execute_code,
        icon: <TerminalSquareIcon className="icon-md" />,
      });
    }
    if (capabilities.ocrEnabled) {
      _options.push({
        label: localize('com_ui_upload_ocr_text'),
        value: EToolResources.ocr,
        icon: <FileType2Icon className="icon-md" />,
      });
    }

    return _options;
  }, [capabilities, files, localize]);

  if (!isVisible) {
    return null;
  }

  return (
    <OGDialog open={isVisible} onOpenChange={setShowModal}>
      <OGDialogTemplate
        title={localize('com_ui_upload_type')}
        className="w-11/12 sm:w-[440px] md:w-[400px] lg:w-[360px]"
        main={
          <div className="flex flex-col gap-2">
            {options.map(
              (option, index) =>
                option.condition !== false && (
                  <button
                    key={index}
                    onClick={() => onOptionSelect(option.value)}
                    className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-active-alt"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ),
            )}
          </div>
        }
      />
    </OGDialog>
  );
};

export default DragDropModal;
