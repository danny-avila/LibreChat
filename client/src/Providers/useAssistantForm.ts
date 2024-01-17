import { useForm } from 'react-hook-form';
import type { AssistantForm } from '~/common';

export default function useAssistantForm() {
  return useForm<AssistantForm>({
    defaultValues: {
      assistant: '',
      id: '',
      name: '',
      description: '',
      instructions: '',
      model: 'gpt-3.5-turbo-1106',
      functions: [],
      code_interpreter: false,
      retrieval: false,
    },
  });
}
