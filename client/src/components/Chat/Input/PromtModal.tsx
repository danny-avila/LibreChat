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
  const { ask, files, setFiles, newConversation, isSubmitting, filesLoading, setFilesLoading } =
    useChatContext();

  const [inputData, setInputData] = useState<{
    [key: string]: {
      value?: string;
      error?: string;
    };
  }>({});

  let buttonText = 'Apply Preset';
  preset.userPrompt?.modalComponents?.forEach((component) => {
    if (component.type === 'button' && component.buttonText) {
      buttonText = component.buttonText;
    }
  });

  useEffect(() => {
    if (!open) {setInputData({});}
  }, [open]);

  function handleSubmit() {
    newConversation({ preset: preset });
    setText('');
    let userPrompt = preset.userPrompt?.prompt || '';
    Object.entries(inputData).forEach(([key, value]) => {
      userPrompt = userPrompt?.replace(`{{${key}}}`, value.value || '');
    });
    ask({ text: userPrompt });
    setOpen(false);
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
                    className="grid grid-cols-[1fr_auto] items-end space-y-1.5 text-left"
                  >
                    <div>
                      <p>{component.labelTitle}</p>
                      <p className="text-xs dark:text-gray-400">{component.labelDescription}</p>
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
                          [component.labelTitle as string]: { value: e.target.value },
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
                          [component.labelTitle as string]: { value: e.target.value },
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

            if (component.type === 'button') {
              return <></>;
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
