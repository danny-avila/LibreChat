import { useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import type { TPromptGroup } from 'librechat-data-provider';
import {
  cn,
  wrapVariable,
  defaultTextProps,
  replaceSpecialVars,
  extractVariableInfo,
} from '~/utils';
import { codeNoExecution } from '~/components/Chat/Messages/Content/Markdown';
import { useAuthContext, useLocalize, useSubmitMessage } from '~/hooks';
import { TextareaAutosize, InputCombobox } from '~/components/ui';

type FieldType = 'text' | 'select';

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
 * Dropdown select with predefined options:
 * {{variable_name:option1|option2|option3}}
 *
 * All dropdown selects allow custom input in addition to predefined options.
 *
 * Examples:
 * {{name}} - Simple text input for a name
 * {{tone:formal|casual|business casual}} - Dropdown for tone selection with custom input option
 *
 * Note: The order of variables in the prompt will be preserved in the input form.
 */

const parseFieldConfig = (variable: string): FieldConfig => {
  const content = variable.trim();
  if (content.includes(':')) {
    const [name, options] = content.split(':');
    if (options && options.includes('|')) {
      return {
        variable: name.trim(),
        type: 'select',
        options: options.split('|').map((opt) => opt.trim()),
      };
    }
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
  const { control, handleSubmit } = useForm<FormValues>({
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

  if (!uniqueVariables.length) {
    return null;
  }

  const generateHighlightedMarkdown = () => {
    let tempText = mainText;
    allVariables.forEach((variable) => {
      const placeholder = `{{${variable}}}`;
      const fieldIndex = variableIndexMap.get(variable) as string | number;
      const fieldValue = fieldValues[fieldIndex].value as string;
      const highlightText = fieldValue !== '' ? fieldValue : placeholder;
      tempText = tempText.replaceAll(placeholder, `**${highlightText}**`);
    });
    return tempText;
  };

  const onSubmit = (data: FormValues) => {
    let text = mainText;
    data.fields.forEach(({ variable, value }) => {
      if (!value) {
        return;
      }

      const escapedVariable = variable.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
      const regex = new RegExp(escapedVariable, 'g');
      text = text.replace(regex, value);
    });

    submitPrompt(text);
    onClose();
  };

  return (
    <div className="mx-auto p-1 md:container">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-6 max-h-screen max-w-[90vw] overflow-auto rounded-md bg-gray-100 p-4 text-text-secondary dark:bg-gray-700/50 sm:max-w-full md:max-h-80">
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={[supersub, remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
            rehypePlugins={[
              /** @ts-ignore */
              [rehypeKatex, { output: 'mathml' }],
              /** @ts-ignore */
              [rehypeHighlight, { ignoreMissing: true }],
            ]}
            /** @ts-ignore */
            components={{ code: codeNoExecution }}
            className="prose dark:prose-invert light dark:text-gray-70 my-1 max-h-[50vh] break-words"
          >
            {generateHighlightedMarkdown()}
          </ReactMarkdown>
        </div>
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col space-y-2">
              <Controller
                name={`fields.${index}.value`}
                control={control}
                render={({ field: { onChange, onBlur, value, ref } }) => {
                  if (field.config.type === 'select') {
                    return (
                      <InputCombobox
                        options={field.config.options || []}
                        placeholder={localize('com_ui_enter_var', field.config.variable)}
                        className={cn(
                          defaultTextProps,
                          'rounded px-3 py-2 focus:bg-surface-tertiary',
                        )}
                        value={value}
                        onChange={onChange}
                        onBlur={onBlur}
                      />
                    );
                  }

                  return (
                    <TextareaAutosize
                      ref={ref}
                      value={value}
                      onChange={onChange}
                      onBlur={onBlur}
                      id={`fields.${index}.value`}
                      className={cn(
                        defaultTextProps,
                        'rounded px-3 py-2 focus:bg-surface-tertiary',
                      )}
                      placeholder={localize('com_ui_enter_var', field.config.variable)}
                      maxRows={8}
                    />
                  );
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
