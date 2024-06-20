import { useMemo } from 'react';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import type { TPromptGroup } from 'librechat-data-provider';
import { extractVariableInfo, wrapVariable, replaceSpecialVars } from '~/utils';
import { useAuthContext, useLocalize, useSubmitMessage } from '~/hooks';
import { Input } from '~/components/ui';

type FormValues = {
  fields: { variable: string; value: string }[];
};

export default function VariableForm({
  group,
  onClose,
}: {
  group: TPromptGroup;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const mainText = useMemo(() => {
    const initialText = group.productionPrompt?.prompt ?? '';
    return replaceSpecialVars({ text: initialText, user });
  }, [group.productionPrompt?.prompt, user]);

  const { allVariables, uniqueVariables, variableIndexMap } = useMemo(
    () => extractVariableInfo(mainText),
    [mainText],
  );

  const { submitPrompt } = useSubmitMessage();
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      fields: uniqueVariables.map((variable) => ({ variable: wrapVariable(variable), value: '' })),
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'fields',
  });

  const fieldValues = useWatch({
    control,
    name: 'fields',
  });

  if (!uniqueVariables.length) {
    return null;
  }

  const generateHighlightedText = () => {
    let tempText = mainText;
    const parts: JSX.Element[] = [];

    allVariables.forEach((variable, index) => {
      const placeholder = `{{${variable}}}`;
      const partsBeforePlaceholder = tempText.split(placeholder);
      const fieldIndex = variableIndexMap.get(variable) as string | number;
      const fieldValue = fieldValues[fieldIndex].value as string;
      parts.push(
        <span key={`before-${index}`}>{partsBeforePlaceholder[0]}</span>,
        <span
          key={`highlight-${index}`}
          className="rounded bg-yellow-100 p-1 font-medium dark:text-gray-800"
        >
          {fieldValue !== '' ? fieldValue : placeholder}
        </span>,
      );

      tempText = partsBeforePlaceholder.slice(1).join(placeholder);
    });

    parts.push(<span key="last-part">{tempText}</span>);

    return parts;
  };

  const onSubmit = (data: FormValues) => {
    let text = mainText;
    data.fields.forEach(({ variable, value }) => {
      if (value) {
        const regex = new RegExp(variable, 'g');
        text = text.replace(regex, value);
      }
    });

    submitPrompt(text);
    onClose();
  };

  return (
    <div className="container mx-auto p-1">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="mb-6 max-h-screen overflow-auto rounded-md bg-gray-100 p-4 dark:bg-gray-700/50 dark:text-gray-300 md:max-h-80">
          <p className="text-md whitespace-pre-wrap">{generateHighlightedText()}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col">
              <Controller
                name={`fields.${index}.value`}
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id={`fields.${index}.value`}
                    className="input text-grey-darker rounded border px-3 py-2 focus:bg-white dark:border-gray-500 dark:focus:bg-gray-700"
                    placeholder={uniqueVariables[index]}
                  />
                )}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
          >
            {localize('com_ui_submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
