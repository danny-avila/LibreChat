import type { JsonSchemaType } from './zod';

export interface FunctionTool {
  type: 'function';
  function: {
    description: string;
    name: string;
    parameters: JsonSchemaType;
  };
}
