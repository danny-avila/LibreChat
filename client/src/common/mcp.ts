import { MCPForm } from '~/common/types';

export const defaultMCPFormValues: MCPForm = {
  name: '',
  description: '',
  url: '',
  tools: [],
  icon: '',
  trust: false,
  customHeaders: [],
  requestTimeout: undefined,
  connectionTimeout: undefined,
};
