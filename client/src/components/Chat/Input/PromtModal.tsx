import { TPreset } from 'librechat-data-provider/dist/types';
import { useEffect, useState } from 'react';
import { useChatContext } from '~/Providers';
import { Textarea } from '~/components/ui';
import { Button } from '~/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { usePresets } from '~/hooks';
import AttachFileModal from './Files/AttachFileModal';

export function PromptModal({
  setText,
  open,
  setOpen,
  preset,
}: {
  setText: (text: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  preset: TPreset;
}) {
  const { ask, isSubmitting, newConversation, files, filesLoading } = useChatContext();

  const { onSelectPreset, onChangePreset } = usePresets();

  const [inputData, setInputData] = useState<{
    [key: string]: {
      value?: string;
      error?: string;
      validation?: {
        pattern: string;
        required: boolean;
      };
    };
  }>({});

  let buttonText = 'Apply Preset';
  preset.userPrompt?.modalComponents?.forEach((component) => {
    if (component.type === 'button' && component.buttonText) {
      buttonText = component.buttonText;
    }
  });

  useEffect(() => {
    if (!open) {
      setInputData({});
    }
    if (open) {
      newConversation();
      onSelectPreset(preset);
    }
  }, [open]);

  function handleSubmit() {
    let userPrompt = preset.userPrompt?.prompt || '';
    let isError = false;
    preset.userPrompt?.modalComponents?.forEach((component) => {
      if (/multi_line_text|single_line_text/.test(component.type)) {
        if (
          component.labelTitle &&
          component.validation?.required &&
          (!component.labelTitle || !inputData[component.labelTitle]?.value)
        ) {
          setInputData({
            ...inputData,
            [component.labelTitle]: {
              ...inputData[component.labelTitle],
              error: 'This feild is required.',
            },
          });
          isError = true;
        }

        if (component.labelTitle && component.validation?.pattern) {
          const regx = new RegExp(component.validation.pattern);
          if (
            inputData[component.labelTitle].value &&
            !regx.test(inputData[component.labelTitle].value || '')
          ) {
            setInputData({
              ...inputData,
              [component.labelTitle]: {
                ...inputData[component.labelTitle],
                error: component.validation.errorMessage || 'Input validation error.',
              },
            });
            isError = true;
          }
        }
      }
    });

    if (isError) {return;}
    setText('');
    setOpen(false);
    Object.entries(inputData).forEach(([key, value]) => {
      userPrompt = userPrompt?.replace(`{{${key}}}`, value.value || '');
    });
    ask({ text: userPrompt });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="dark:bg-gray-800 sm:max-w-[40rem]">
        <DialogHeader>
          <DialogTitle>Fill up the prompt variables</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 p-5">
          {preset.userPrompt?.modalComponents?.map((component, index) => {
            if (/multi_line_text|single_line_text/.test(component.type) && component.labelTitle) {
              return (
                <div key={index} className="space-y-2">
                  <Label
                    htmlFor={component.labelTitle}
                    className="grid grid-cols-[1fr_auto] items-end space-y-2 text-left"
                  >
                    <div className="space-y-0.5">
                      <p>
                        {component.labelTitle}{' '}
                        {component.validation?.required ? (
                          <span className="text-xs opacity-75">(*Required)</span>
                        ) : null}
                      </p>
                      <p className="text-xs font-light dark:text-gray-400">
                        {component.labelDescription}
                      </p>
                      {inputData[component.labelTitle]?.error ? (
                        <p className="text-xs text-red-400">
                          {inputData[component.labelTitle].error}
                        </p>
                      ) : null}
                    </div>

                    {component.example ? (
                      <Button
                        onClick={() =>
                          setInputData({
                            ...inputData,
                            [component.labelTitle as string]: { value: component.example },
                          })
                        }
                        variant="outline"
                        className="h-8 text-sm dark:hover:bg-gray-600"
                      >
                        Use Example
                      </Button>
                    ) : null}
                  </Label>

                  {component.type === 'multi_line_text' ? (
                    <Textarea
                      id={component.labelTitle}
                      onChange={(e) =>
                        setInputData({
                          ...inputData,
                          [component.labelTitle as string]: {
                            value: e.target.value,
                          },
                        })
                      }
                      value={inputData[component.labelTitle]?.value}
                      placeholder={component.placeholder}
                      className="mb-4"
                    />
                  ) : (
                    <Input
                      id={component.labelTitle}
                      onChange={(e) =>
                        setInputData({
                          ...inputData,
                          [component.labelTitle as string]: {
                            value: e.target.value,
                          },
                        })
                      }
                      value={inputData[component.labelTitle]?.value}
                      placeholder={component.placeholder}
                      className="mb-4"
                    />
                  )}
                </div>
              );
            }

            if (component.type === 'file_upload') {
              return (
                <>
                  {component.validation?.required && files.entries.length === 0 ? (
                    <p className="mb-[-1rem] text-xs text-red-400">* Required</p>
                  ) : null}
                  <AttachFileModal lebel={component.labelTitle} />
                </>
              );
            }
          })}
        </div>

        <DialogFooter>
          <Button className="w-full dark:hover:bg-gray-600" type="submit" onClick={handleSubmit}>
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
