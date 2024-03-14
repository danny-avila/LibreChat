export interface Preset {
  endpoint?: string;
  model?: string;
  metadata: Metadata;
  modalComponents?: ModalComponent[];
  system_prompt: string;
  user_prompt?: string;
  icon: string;
}

export interface Metadata {
  jobTitle: string;
  taskName: string;
  marketingText: string;
  limitations: string;
}

export interface ModalComponent {
  type: 'button' | 'multi_line_text' | 'single_line_text' | 'file_upload';
  labelTitle?: string;
  labelDescription?: string;
  placeholder?: string;
  example?: string;
  validation?: Validation;
  buttonText?: string;
}

export interface Validation {
  pattern: string;
  required: boolean;
}
