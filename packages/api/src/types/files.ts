import type { ServerRequest } from './http';
export interface STTService {
  getInstance(): Promise<STTService>;
  getProviderSchema(req: ServerRequest): Promise<[string, object]>;
  sttRequest(
    provider: string,
    schema: object,
    params: { audioBuffer: Buffer; audioFile: AudioFileInfo },
  ): Promise<string>;
}

export interface AudioFileInfo {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface FileObject {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AudioProcessingResult {
  text: string;
  bytes: number;
}
