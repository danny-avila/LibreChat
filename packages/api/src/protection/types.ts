export type ContentSource =
  | 'message'
  | 'prompt'
  | 'agent_instruction'
  | 'conversation_starter'
  | 'memory'
  | 'file_name'
  | 'file_text'
  | 'tool_argument'
  | 'tool_result'
  | 'skill_instruction'
  | 'feedback'
  | 'title'
  | 'retrieved_content'
  | 'assembled_context';

export type ContentProvenance =
  | 'user'
  | 'administrator'
  | 'model'
  | 'tool'
  | 'retrieval'
  | 'system'
  | 'external_agent';

export type ContentFormat = 'plain' | 'markdown' | 'json' | 'uri';
export type ContentTreatment = 'replaceable' | 'inspect_only';
export type JsonPointer = `/${string}`;

export interface TextContentFragment {
  readonly id: string;
  readonly source: ContentSource;
  readonly provenance: ContentProvenance;
  readonly path: JsonPointer;
  readonly format: ContentFormat;
  readonly treatment: ContentTreatment;
  readonly text: string;
}

export interface ProtectionFinding {
  readonly detectorId: string;
  readonly ruleId: string;
  readonly label: string;
  readonly source: ContentSource;
  readonly provenance: ContentProvenance;
  readonly fragmentId: string;
  readonly fragmentPath: JsonPointer;
}
