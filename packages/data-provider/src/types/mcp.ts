export interface ElicitationPropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time';
  default?: string | number | boolean;
  enum?: string[];
  enumNames?: string[];
}

export interface ElicitationRequestSchema {
  type: 'object';
  properties: Record<string, ElicitationPropertySchema>;
  required?: string[];
}

export interface ElicitationRequest {
  message: string;
  requestedSchema: ElicitationRequestSchema;
}

export interface ElicitationState {
  id: string;
  serverName: string;
  userId: string;
  request: ElicitationRequest;
  timestamp: number;
  tool_call_id?: string;
}

export interface ElicitationResponse {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}
