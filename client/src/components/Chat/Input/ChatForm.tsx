import { useRecoilState } from 'recoil';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useChatContext } from '~/Providers';
import { usePresets, useRequiresKey } from '~/hooks';
import AttachFile from './Files/AttachFile';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import Textarea from './Textarea';
import store from '~/store';
import Voice from './Voice';
import { useGetPresetsQuery } from '~/data-provider';
import { EModelEndpoint, ImageDetail, TPreset, visionModels } from 'librechat-data-provider';
import PresetItem from './PresetItem';
import { PromptModal } from './PromtModal';
import { number } from 'zod';

export default function ChatForm({ index = 0 }) {
  const [text, setText] = useRecoilState(store.textByIndex(index));
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activePresetIndex, setActivePresetIndex] = useState<number>();
  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    handleStopGenerating,
    filesLoading,
    setFilesLoading,
    recordingSate,
    recordedText,
    setRecordedText,
  } = useChatContext();

  const { presetsQuery } = usePresets();

  const presets = presetsQuery.data || [];

  const submitMessage = () => {
    if (!recordedText && recordingSate !== 'recording') {
      ask({ text });
      setText('');
    }
  };

  useEffect(() => {
    if (recordedText) {
      setText(text + ' ' + recordedText);
      setRecordedText(undefined);
    }
  }, [recordedText]);

  function handlePresetClick(preset: TPreset, index: number) {
    if (preset.userPrompt?.modalComponents) {
      setActivePresetIndex(index);
      setIsModalOpen(true);
    }
  }

  const { requiresKey } = useRequiresKey();
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  return (
    <>
      <div
        className={`${
          text === '/' ? '' : 'hidden'
        } mx-2 mb-4 max-h-[24rem] space-y-1.5 overflow-y-scroll rounded-lg border border-gray-600 p-1.5 dark:bg-gray-900/50 md:mx-4 lg:mx-auto lg:max-w-2xl xl:max-w-3xl`}
      >
        {presets?.map((preset, index) => {
          if (preset.userPrompt) {
            return (
              <PresetItem
                index={index}
                handlePresetClick={handlePresetClick}
                key={preset?.presetId ?? Math.random()}
                preset={preset}
              />
            );
          }
        })}
      </div>
      {typeof activePresetIndex === 'number' && presets ? (
        <PromptModal
          setText={setText}
          open={isModalOpen}
          setOpen={setIsModalOpen}
          preset={presets[activePresetIndex]}
        />
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitMessage();
        }}
        className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
      >
        <div className="relative flex h-full flex-1 items-stretch md:flex-col">
          <div className="flex w-full items-center">
            <div className="[&:has(textarea:focus)]:border-token-border-xheavy dark:border-token-border-medium border-token-border-medium bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border dark:text-white [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
              <FileRow
                files={files}
                setFiles={setFiles}
                setFilesLoading={setFilesLoading}
                Wrapper={({ children }) => (
                  <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
                    {children}
                  </div>
                )}
              />

              {endpoint && (
                <Textarea
                  value={text}
                  disabled={requiresKey}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                  setText={setText}
                  submitMessage={submitMessage}
                  endpoint={_endpoint}
                  endpointType={endpointType}
                />
              )}
              <div className="absolute bottom-1.5 left-2 flex gap-1 md:bottom-3 md:left-4">
                <AttachFile
                  endpoint={_endpoint ?? ''}
                  endpointType={endpointType}
                  disabled={requiresKey}
                />
                <Voice disabled={requiresKey} />
              </div>
              {isSubmitting && showStopButton ? (
                <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
              ) : (
                endpoint && (
                  <SendButton
                    text={text}
                    disabled={
                      filesLoading || isSubmitting || requiresKey || recordingSate !== 'idle'
                    }
                  />
                )
              )}
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
