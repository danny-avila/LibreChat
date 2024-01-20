import { useForm } from 'react-hook-form';
import { defaultAssistantFormValues } from 'librechat-data-provider';
import type { AssistantForm } from '~/common';

export default function useAssistantForm() {
  return useForm<AssistantForm>({
    defaultValues: defaultAssistantFormValues,
  });
}
