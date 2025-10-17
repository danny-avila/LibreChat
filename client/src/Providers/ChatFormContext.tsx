import type { ChatFormValues } from '~/common';
import { createFormContext } from './CustomFormContext';

const { CustomFormProvider, useCustomFormContext } = createFormContext<ChatFormValues>();

export { CustomFormProvider as ChatFormProvider, useCustomFormContext as useChatFormContext };
