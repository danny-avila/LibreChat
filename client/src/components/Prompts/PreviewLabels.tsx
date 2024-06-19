import { useState } from 'react';
import { Cross1Icon } from '@radix-ui/react-icons';
import type { TPrompt } from 'librechat-data-provider';
import { useUpdatePromptLabels } from '~/data-provider';
import { Input } from '~/components/ui';

const PromptForm = ({ selectedPrompt }: { selectedPrompt?: TPrompt }) => {
  const [labelInput, setLabelInput] = useState<string>('');
  const [labels, setLabels] = useState<string[]>([]);
  const updatePromptLabelsMutation = useUpdatePromptLabels();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabelInput(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && labelInput.trim()) {
      const newLabels = [...labels, labelInput.trim()];
      setLabels(newLabels);
      setLabelInput('');
      updatePromptLabelsMutation.mutate({
        id: selectedPrompt?._id || '',
        payload: { labels: newLabels },
      });
    }
  };

  return (
    <>
      <Input
        type="text"
        className="mb-4"
        placeholder="+ Add Labels"
        // defaultValue={selectedPrompt?.labels.join(', ')}
        value={labelInput}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
      />
      <h3 className="rounded-t-lg border border-gray-300 px-4 text-base font-semibold">Labels</h3>
      <div className="mb-4 flex w-full flex-row flex-wrap rounded-b-lg border border-gray-300 p-4">
        {labels.length ? (
          labels.map((label, index) => (
            <label
              className="mb-1 mr-1 flex items-center gap-x-2 rounded-full border px-2"
              key={index}
            >
              {label}
              <Cross1Icon
                onClick={() => {
                  const newLabels = labels.filter((l) => l !== label);
                  setLabels(newLabels);
                  updatePromptLabelsMutation.mutate({
                    id: selectedPrompt?._id || '',
                    payload: { labels: newLabels },
                  });
                }}
                className="cursor-pointer"
              />
            </label>
          ))
        ) : (
          <label className="rounded-full border px-2">No Labels</label>
        )}
      </div>
    </>
  );
};

export default PromptForm;
