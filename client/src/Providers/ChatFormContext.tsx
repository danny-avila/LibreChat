import { createFormContext } from './CustomFormContext';
import type { ChatFormValues } from '~/common';

const { CustomFormProvider, useCustomFormContext } = createFormContext<ChatFormValues>();

export { CustomFormProvider as ChatFormProvider, useCustomFormContext as useChatFormContext };
