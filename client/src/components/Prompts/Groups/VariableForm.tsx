import React, { useMemo, useState } from 'react';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import type { TPromptGroup } from 'librechat-data-provider';
import { extractVariableInfo, wrapVariable, replaceSpecialVars } from '~/utils';
import { useAuthContext, useLocalize, useSubmitMessage } from '~/hooks';
import { TextareaAutosize, Input, InputWithDropdown } from '~/components/ui';

type FieldType = 'text' | 'multiline' | 'select';

type FieldConfig = {
  variable: string;
  type: FieldType;
  options?: string[];
};

type FormValues = {
  fields: { variable: string; value: string; config: FieldConfig }[];
};

/**
 * Variable Format Guide:
 *
 * Variables in prompts should be enclosed in double curly braces: {{variable}}
 *
 * Simple text input:
 * {{variable_name}}
 *
 * Multiline text input:
 * {{variable_name:multiline}}
 *
 * Dropdown select with predefined options:
 * {{variable_name:option1|option2|option3}}
 *
 * All dropdown selects allow custom input in addition to predefined options.
 *
 * Examples:
 * {{name}} - Simple text input for a name
 * {{email:multiline}} - Multiline input for an email
 * {{tone:formal|casual|business casual}} - Dropdown for tone selection with custom input option
 *
 * Note: The order of variables in the prompt will be preserved in the input form.
 */

const parseFieldConfig = (variable: string): FieldConfig => {
  const content = variable;
  if (content.includes(':')) {
    const [name, options] = content.split(':');
    if (options && options.includes('|')) {
      return { variable: name, type: 'select', options: options.split('|') };
    }
    return { variable: name, type: options as FieldType };
  }
  return { variable: content, type: 'text' };
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
  const { control, handleSubmit, setValue } = useForm<FormValues>({
    defaultValues: {
      fields: uniqueVariables.map((variable) => ({
        variable: wrapVariable(variable),
        value: '',
        config: parseFieldConfig(variable),
      })),
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

  const [customOptions, setCustomOptions] = useState<{ [key: string]: string }>({});

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
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col space-y-2">
              <Controller
                name={`fields.${index}.value`}
                control={control}
                render={({ field: inputField }) => {
                  switch (field.config.type) {
                    case 'multiline':
                      return (
                        <TextareaAutosize
                          {...inputField}
                          id={`fields.${index}.value`}
                          className="w-full rounded border px-3 py-2"
                          placeholder={`Enter ${field.config.variable}`}
                        />
                      );
                    case 'select':
                      return (
                        <InputWithDropdown
                          {...inputField}
                          id={`fields.${index}.value`}
                          className="w-full rounded border px-3 py-2"
                          placeholder={`Enter ${field.config.variable}`}
                          options={field.config.options || []}
                        />
                      );
                    default:
                      return (
                        <Input
                          {...inputField}
                          id={`fields.${index}.value`}
                          className="w-full rounded border px-3 py-2"
                          placeholder={`Enter ${field.config.variable}`}
                        />
                      );
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn rounded bg-green-500 px-4 py-2 font-bold text-white transition-all hover:bg-green-600"
          >
            {localize('com_ui_submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
