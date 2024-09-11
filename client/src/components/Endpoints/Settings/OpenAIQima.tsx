import TextareaAutosize from 'react-textarea-autosize';
import type { TModelSelectProps } from '~/common';
import { SelectDropDown, Input, Label } from '~/components/ui';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils/';
import { useLocalize } from '~/hooks';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  if (!conversation) {
    return null;
  }
  const { model, chatGptLabel, promptPrefix } = conversation;
  const endpoint = conversation.endpoint || 'openAI';
  const isOpenAI = endpoint === 'openAI' || endpoint === 'azureOpenAI';

  const setModel = setOption('model');
  const setChatGptLabel = setOption('chatGptLabel');
  const setPromptPrefix = setOption('promptPrefix');

  return (
    <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-3">
      <div className="grid w-full items-center gap-2">
        <SelectDropDown
          value={model ?? ''}
          setValue={setModel}
          availableValues={models}
          disabled={readonly}
          className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusOutlines)}
          containerClassName="flex w-full resize-none"
        />
      </div>
      {isOpenAI && (
        <>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
              {localize('com_endpoint_custom_name')}{' '}
              <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
            </Label>
            <Input
              id="chatGptLabel"
              disabled={readonly}
              value={chatGptLabel || ''}
              onChange={(e) => setChatGptLabel(e.target.value ?? null)}
              placeholder={localize('com_endpoint_openai_custom_name_placeholder')}
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                removeFocusOutlines,
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="promptPrefix" className="text-left text-sm font-medium">
              {localize('com_endpoint_prompt_prefix')}{' '}
              <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly}
              value={promptPrefix || ''}
              onChange={(e) => setPromptPrefix(e.target.value ?? null)}
              placeholder={localize('com_endpoint_openai_prompt_prefix_placeholder')}
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 ',
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
