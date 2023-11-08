import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Switch } from '~/components/ui/Switch';
import { Separator } from '~/components/ui/Separator';

type Actions = {
  functions: boolean;
  codeInterpreter: boolean;
  retrieval: boolean;
};

type CreationForm = {
  name: string;
  instructions: string;
  model: string;
  tools: string[];
} & Actions;

export default function CreationPanel() {
  // const { control, handleSubmit, watch, register } = useForm<CreationForm>({
  const { control, handleSubmit } = useForm<CreationForm>({
    defaultValues: {
      name: 'Assistant GPT',
      instructions: 'The coolest assistant, stock trader!',
      model: 'gpt-3.5-turbo-1106',
      tools: ['get_stock_price', 'code_interpreter', 'retrieval'], // Assuming these are the tools available
    },
  });

  const onSubmit = (data: CreationForm) => {
    console.log(data);
  };

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
    <form onSubmit={handleSubmit(onSubmit)} className="container mx-auto px-4 py-2">
      <div className="mb-4 rounded bg-white px-8 pb-8 pt-6 shadow-md">
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
                className="focus:shadow-outline w-full appearance-none rounded border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:outline-none"
                id="name"
                type="text"
                placeholder="Assistant GPT"
              />
            )}
          />
          <p className="text-xs italic text-gray-600">asst_qXrYBwdKPSTyABTRr1c3vSNF</p>
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
                className="focus:shadow-outline w-full resize-none appearance-none rounded border px-3 py-2 text-sm leading-tight text-gray-700 shadow focus:outline-none"
                id="instructions"
                placeholder="The coolest assistant, stock trader!"
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
                className="focus:shadow-outline  block w-full appearance-none rounded border border-gray-400 bg-white px-4 py-2 pr-8 text-sm leading-tight shadow hover:border-gray-500 focus:outline-none"
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
            {/* <Separator orientation="horizontal" className='bg-gray-100/50' />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Functions</span>
              {renderSwitch('functions')}
            </div> */}
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Code Interpreter</span>
              {renderSwitch('codeInterpreter')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Retrieval</span>
              {renderSwitch('retrieval')}
            </div>
            <Separator orientation="horizontal" className="bg-gray-100/50" />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end">
          <button
            className="focus:shadow-outline rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none"
            type="submit"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
