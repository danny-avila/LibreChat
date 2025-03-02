import React, { useMemo } from 'react';
import { EModelEndpoint, EToolResources } from 'librechat-data-provider';
import { FileSearch, ImageUpIcon, TerminalSquareIcon } from 'lucide-react';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useGetEndpointsQuery } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import { OGDialog } from '~/components/ui';

interface DragDropModalProps {
  onOptionSelect: (option: string | undefined) => void;
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
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const capabilities = useMemo(
    () => endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [],
    [endpointsConfig],
  );

  const options = useMemo(() => {
    const _options: FileOption[] = [
      {
        label: localize('com_ui_upload_image_input'),
        value: undefined,
        icon: <ImageUpIcon className="icon-md" />,
        condition: files.every((file) => file.type.startsWith('image/')),
      },
    ];
    for (const capability of capabilities) {
      if (capability === EToolResources.file_search) {
        _options.push({
          label: localize('com_ui_upload_file_search'),
          value: EToolResources.file_search,
          icon: <FileSearch className="icon-md" />,
        });
      } else if (capability === EToolResources.execute_code) {
        _options.push({
          label: localize('com_ui_upload_code_files'),
          value: EToolResources.execute_code,
          icon: <TerminalSquareIcon className="icon-md" />,
        });
      }
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
