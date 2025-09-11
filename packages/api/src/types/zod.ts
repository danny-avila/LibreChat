export type JsonSchemaType = {
  type: 'string' | 'number' | 'integer' | 'float' | 'boolean' | 'array' | 'object';
  enum?: string[];
  items?: JsonSchemaType;
  properties?: Record<string, JsonSchemaType>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | JsonSchemaType;
};

export type ConvertJsonSchemaToZodOptions = {
  allowEmptyObject?: boolean;
  dropFields?: string[];
  transformOneOfAnyOf?: boolean;
};
