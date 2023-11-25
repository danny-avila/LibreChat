import { useForm } from 'react-hook-form';
import type { Tool } from 'librechat-data-provider';
import type { CreationForm, TAssistantOption } from '~/common';

export default function useViewPromptForm() {
  // Retrieve the stored assistant data from localStorage
  const storedAssistant = localStorage.getItem('lastAssistant');
  let defaultAssistantValues = {};

  if (storedAssistant) {
    const assistantData = JSON.parse(storedAssistant) as TAssistantOption;

    if (typeof assistantData === 'string') {
      // If the assistant data is a string, no assistant was selected.
    } else {
      // Map the assistant data to the form fields
      defaultAssistantValues = {
        assistant: assistantData,
        id: assistantData.id,
        name: assistantData.name,
        description: assistantData.description,
        instructions: assistantData.instructions,
        model: assistantData.model,
        function: assistantData.tools?.some((tool: Tool) => tool.type === 'function') ?? false,
        code_interpreter:
          assistantData.tools?.some((tool: Tool) => tool.type === 'code_interpreter') ?? false,
        retrieval: assistantData.tools?.some((tool: Tool) => tool.type === 'retrieval') ?? false,
      };
    }
  }

  // Initialize the form with default values
  return useForm<CreationForm>({
    defaultValues: {
      assistant: '',
      id: '',
      name: '',
      description: '',
      instructions: '',
      model: 'gpt-3.5-turbo-1106',
      function: false,
      code_interpreter: false,
      retrieval: false,
      ...defaultAssistantValues, // Spread the defaultAssistantValues here
    },
  });
}
