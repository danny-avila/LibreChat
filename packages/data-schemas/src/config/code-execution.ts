/**
 * Configuration for code execution backends
 */

export enum CodeExecutorType {
  LIBRECHAT = 'librechat',
  PISTON = 'piston',
}

export interface CodeExecutionConfig {
  executor: CodeExecutorType;
  pistonUrl?: string;
}

export const DEFAULT_CODE_EXECUTOR = CodeExecutorType.LIBRECHAT;
export const DEFAULT_PISTON_URL = 'https://emkc.org/api/v2/piston';

