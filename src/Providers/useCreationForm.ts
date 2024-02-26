// import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { CreationForm } from '~/common';

export default function useViewPromptForm() {
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
    },
  });
}
