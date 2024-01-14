import { Controller, useWatch } from 'react-hook-form';
import { Tools, EModelEndpoint } from 'librechat-data-provider';
import { useCreateAssistantMutation } from 'librechat-data-provider/react-query';
import type { CreationForm, Actions } from '~/common';
import type { Tool } from 'librechat-data-provider';
import { Separator } from '~/components/ui/Separator';
import { useAssistantsContext } from '~/Providers';
import { Switch } from '~/components/ui/Switch';
import CreationHeader from './CreationHeader';
import { useNewConvo } from '~/hooks';

export default function CreationPanel({ index = 0 }) {
  const { switchToConversation } = useNewConvo(index);
  const create = useCreateAssistantMutation();
  const { control, handleSubmit, reset, setValue } = useAssistantsContext();

  const onSubmit = (data: CreationForm) => {
    const tools: Tool[] = [];
    console.log(data);
    if (data.function) {
      tools.push({ type: Tools.function });
    }
    if (data.code_interpreter) {
      tools.push({ type: Tools.code_interpreter });
    }
    if (data.retrieval) {
      tools.push({ type: Tools.retrieval });
    }

    const {
      name,
      description,
      instructions,
      model,
      // file_ids,
    } = data;

    create.mutate({
      name,
      description,
      instructions,
      model,
      tools,
    });
  };

  const assistant_id = useWatch({ control, name: 'id' });

  // Render function for the Switch component
  const renderSwitch = (name: keyof Actions) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value}
          onCheckedChange={field.onChange}
          className="relative inline-flex h-6 w-11 items-center rounded-full data-[state=checked]:bg-green-500"
          value={field?.value?.toString()}
        />
      )}
    />
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="h-auto w-1/3 flex-shrink-0 overflow-x-hidden"
    >
      <Controller
        name="assistant"
        control={control}
        render={({ field }) => (
          <CreationHeader
            reset={reset}
            value={field.value}
            onChange={field.onChange}
            setValue={setValue}
          />
        )}
      />
      <div className="h-auto bg-white px-8 pb-8 pt-6">
        {/* Name */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-bold text-gray-700" htmlFor="name">
            Name
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                {...{ max: 256 }}
                className="focus:shadow-outline w-full appearance-none rounded border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:border-green-500 focus:outline-none focus:ring-0"
                id="name"
                type="text"
                placeholder="Optional: The name of the assistant"
              />
            )}
          />
          <Controller
            name="id"
            control={control}
            render={({ field }) => (
              <p className="h-3 text-xs italic text-gray-600">{field.value ?? ''}</p>
            )}
          />
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-bold text-gray-700" htmlFor="description">
            Description
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                {...{ max: 512 }}
                className="focus:shadow-outline w-full appearance-none rounded border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:border-green-500 focus:outline-none focus:ring-0"
                id="description"
                type="text"
                placeholder="Optional: Describe your Assistant here"
              />
            )}
          />
        </div>

        {/* Instructions */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-bold text-gray-700" htmlFor="instructions">
            Instructions
          </label>
          <Controller
            name="instructions"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                value={field.value ?? ''}
                {...{ max: 32768 }}
                className="focus:shadow-outline w-full resize-none appearance-none rounded border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:border-green-500 focus:outline-none focus:ring-0"
                id="instructions"
                placeholder="The system instructions that the assistant uses"
                rows={3}
              />
            )}
          />
        </div>

        {/* Model */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-bold text-gray-700" htmlFor="model">
            Model
          </label>
          <Controller
            name="model"
            control={control}
            render={({ field }) => (
              <select
                {...field}
                className="focus:shadow-outline block w-full appearance-none rounded border border-gray-200 bg-white px-4 py-2 pr-8 text-sm leading-tight shadow hover:border-gray-100 focus:border-green-500 focus:outline-none focus:ring-0"
                id="model"
              >
                <option value="gpt-3.5-turbo-1106">gpt-3.5-turbo-1106</option>
                {/* Additional model options here */}
              </select>
            )}
          />
        </div>

        {/* Tools */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-bold text-gray-700">Tools</label>
          <div className="flex flex-col space-y-4">
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Functions</span>
              {renderSwitch('function')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Code Interpreter</span>
              {renderSwitch('code_interpreter')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Retrieval</span>
              {renderSwitch('retrieval')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
          </div>
        </div>
        <div className="flex items-center justify-end">
          {/* Use Button */}
          <button
            className="focus:shadow-outline mx-2 rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
            type="button"
            onClick={(e) => {
              e.preventDefault();
              switchToConversation({
                endpoint: EModelEndpoint.assistant,
                conversationId: 'new',
                assistant_id,
                title: null,
                createdAt: '',
                updatedAt: '',
              });
            }}
          >
            Use
          </button>
          {/* Submit Button */}
          <button
            className="focus:shadow-outline rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
            type="submit"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
