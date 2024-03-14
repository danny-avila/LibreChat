import {} from 'lucide-react';
import { Preset } from './types';
import { Cross1Icon } from '@radix-ui/react-icons';
import { Button } from '../ui';
import { useCreatePresetMutation } from 'librechat-data-provider/react-query';
import { useToast } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import Markdown from 'react-markdown';
import { useState } from 'react';

const PresetSidebar = ({
  preset,
  setSelectedPreset,
}: {
  preset: Preset;
  setSelectedPreset: (preset: Preset | undefined) => void;
}) => {
  const createPresetMutation = useCreatePresetMutation();
  const showToast = useToast().showToast;
  const localize = useLocalize();
  const [isInProgress, setIsInPregress] = useState(false);

  const handleAddPreset = (preset: Preset) => {
    setIsInPregress(true);
    createPresetMutation.mutate(
      {
        endpoint: preset.endpoint || 'openAI',
        model: preset.model || 'gpt-4-0613',
        title: preset.metadata.jobTitle,
        chatGptLabel: preset.metadata.jobTitle,
        promptPrefix: preset.system_prompt,
        userPrompt: {
          modalComponents: preset.modalComponents,
          prompt: preset.user_prompt,
        },
      },
      {
        onSuccess: () => {
          showToast({
            message: `${preset.metadata.jobTitle} ${localize('com_endpoint_preset_saved')}`,
          });
          setIsInPregress(false);
        },
        onError: () => {
          showToast({
            message: localize('com_endpoint_preset_save_error'),
            severity: NotificationSeverity.ERROR,
          });
          setIsInPregress(false);
        },
      },
    );
  };

  return (
    <div className="space-y-2 border-l border-gray-300 p-4 dark:border-gray-600">
      <div className="w-full">
        <Button
          onClick={() => setSelectedPreset(undefined)}
          size="icon"
          variant="outline"
          className="dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          <Cross1Icon className="h-5 w-5" />
        </Button>
      </div>
      <div className="grid place-items-center gap-3">
        <div className="h-16 w-16  rounded-full bg-gray-750 p-2">
          <img src={preset.icon} alt="" />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">{preset.metadata.jobTitle}</h3>
        <p className="text-sm text-gray-400">{preset.metadata.marketingText}</p>
      </div>
      <div className="space-y-4 pt-5">
        <Button
          disabled={isInProgress}
          onClick={() => handleAddPreset(preset)}
          className="w-full dark:hover:bg-gray-600"
        >
          Add Preset
        </Button>
        <div className="h-[1px] bg-gray-500"></div>
        <Markdown className="prose prose-sm dark:prose-invert">{preset.system_prompt}</Markdown>
      </div>
    </div>
  );
};

export default PresetSidebar;
