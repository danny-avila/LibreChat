/**
 * Type definitions for Piston API
 */

export interface PistonFile {
  name?: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface PistonExecuteRequest {
  language: string;
  version: string;
  files: PistonFile[];
}

export interface PistonExecuteResponse {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
  };
}

export interface PistonRuntime {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;
}

export interface ExtractedFile {
  filename: string;
  content: string;
  encoding: 'base64' | 'utf8';
}

